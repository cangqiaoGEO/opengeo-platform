import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { useState } from "react";
import { listDrafts } from "@/server/tasks";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
	generating: { label: "生成中", variant: "secondary" },
	needs_facts: { label: "待补事实", variant: "destructive" },
	pending_review: { label: "待审核", variant: "outline" },
	approved: { label: "已通过", variant: "default" },
	rejected: { label: "已打回", variant: "secondary" },
	published: { label: "已发布", variant: "default" },
};

export const Route = createFileRoute("/_authed/drafts")({
	validateSearch: (search: Record<string, unknown>) => ({
		brand: typeof search.brand === "string" ? search.brand : undefined,
	}),
	loaderDeps: ({ search }) => ({ brand: search.brand }),
	loader: async ({ context, deps }) => {
		const brands = context.workspace.brands;
		const brandId = deps.brand ?? brands[0]?.id;
		if (!brandId) return { drafts: [] };
		return { drafts: await listDrafts({ data: { brandId } }) };
	},
	component: DraftsPage,
});

function DraftsPage() {
	const { drafts } = Route.useLoaderData();
	const [open, setOpen] = useState<string | null>(null);

	return (
		<div className="mx-auto max-w-4xl px-8 py-10">
			<header className="mb-8">
				<h1 className="text-2xl font-semibold tracking-tight">草稿</h1>
				<p className="text-muted-foreground mt-2 max-w-prose text-sm">
					「待补事实」不是失败，是活儿：模型写了事实库支撑不了的话，那句话要么找到证据补进事实库，要么从正文里去掉。
				</p>
			</header>

			{drafts.length === 0 ? (
				<p className="text-muted-foreground text-sm">还没有草稿，去创作任务生成。</p>
			) : (
				<div className="space-y-3">
					{drafts.map((d) => {
						const status = STATUS_LABEL[d.status] ?? { label: d.status, variant: "secondary" as const };
						return (
							<Card key={d.id}>
								<CardHeader className="cursor-pointer" onClick={() => setOpen(open === d.id ? null : d.id)}>
									<div className="flex items-start justify-between gap-4">
										<CardTitle className="text-base leading-snug">{d.title}</CardTitle>
										<Badge variant={status.variant}>{status.label}</Badge>
									</div>
									<div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
										<span>{d.modelVersion}</span>
										{d.unsupportedClaims.length > 0 && (
											<span className="text-destructive">{d.unsupportedClaims.length} 条无据说法</span>
										)}
										{d.flaggedTerms.length > 0 && (
											<span className="text-amber-600">敏感词：{d.flaggedTerms.join("、")}</span>
										)}
									</div>
								</CardHeader>
								{open === d.id && (
									<CardContent className="space-y-4">
										{d.unsupportedClaims.length > 0 && (
											<div className="border-destructive/40 bg-destructive/5 rounded-md border p-3">
												<p className="text-destructive mb-2 text-xs font-medium">事实库支撑不了这些说法</p>
												<ul className="list-disc space-y-1 pl-4 text-sm">
													{d.unsupportedClaims.map((c, i) => (
														<li key={i}>{c}</li>
													))}
												</ul>
											</div>
										)}
										<article className="prose prose-sm max-w-none whitespace-pre-wrap">{d.body}</article>
									</CardContent>
								)}
							</Card>
						);
					})}
				</div>
			)}
		</div>
	);
}
