import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import {
	createTemplate,
	deleteTemplate,
	listTemplates,
	seedDefaultTemplates,
	setTemplateEnabled,
} from "@/server/templates";

export const Route = createFileRoute("/_authed/templates")({
	validateSearch: (search: Record<string, unknown>) => ({
		brand: typeof search.brand === "string" ? search.brand : undefined,
	}),
	loaderDeps: ({ search }) => ({ brand: search.brand }),
	loader: async ({ context, deps }) => {
		const brands = context.workspace.brands;
		const brandId = deps.brand ?? brands[0]?.id;
		if (!brandId) return { brandId: null, templates: [] };
		return { brandId, templates: await listTemplates({ data: { brandId } }) };
	},
	component: TemplatesPage,
});

function TemplatesPage() {
	const { brandId, templates } = Route.useLoaderData();
	const router = useRouter();
	const [busy, setBusy] = useState(false);

	if (!brandId) return <p className="p-8 text-sm">先在监测平台建一个品牌。</p>;

	const byKind = {
		article: templates.filter((t) => t.kind === "article"),
		title: templates.filter((t) => t.kind === "title"),
	};

	return (
		<div className="mx-auto max-w-4xl px-8 py-10">
			<header className="mb-8">
				<h1 className="text-2xl font-semibold tracking-tight">指令模板</h1>
				<p className="text-muted-foreground mt-2 max-w-prose text-sm">
					标题和正文分开写，各存一组。生成时按序轮换——用同一条指令连写三十篇，出来的就是同一篇文章的三十个说法。
				</p>
			</header>

			{templates.length === 0 && (
				<Card className="mb-6">
					<CardHeader>
						<CardTitle className="text-base">还没有指令</CardTitle>
						<CardDescription>先装上默认的两条：八段式文章指令与标题指令，可以直接改。</CardDescription>
					</CardHeader>
					<CardContent>
						<Button
							disabled={busy}
							onClick={async () => {
								setBusy(true);
								try {
									await seedDefaultTemplates({ data: { brandId } });
									router.invalidate();
								} finally {
									setBusy(false);
								}
							}}
						>
							装入默认指令
						</Button>
					</CardContent>
				</Card>
			)}

			<NewTemplate brandId={brandId} onDone={() => router.invalidate()} />

			{(["article", "title"] as const).map((kind) => (
				<section key={kind} className="mt-8">
					<h2 className="text-muted-foreground mb-2 font-mono text-xs tracking-widest uppercase">
						{kind === "article" ? "文章指令" : "标题指令"}
					</h2>
					{byKind[kind].length === 0 ? (
						<p className="text-muted-foreground text-sm">无</p>
					) : (
						<div className="divide-y rounded-lg border">
							{byKind[kind].map((t) => (
								<div key={t.id} className="flex items-start justify-between gap-4 p-4">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<p className="text-sm font-medium">{t.name}</p>
											{t.channel && <Badge variant="outline">{t.channel}</Badge>}
											{!t.enabled && <Badge variant="secondary">已停用</Badge>}
										</div>
										<p className="text-muted-foreground mt-2 line-clamp-3 text-xs whitespace-pre-wrap">{t.body}</p>
									</div>
									<div className="flex shrink-0 gap-1">
										<Button
											variant="ghost"
											size="sm"
											onClick={async () => {
												await setTemplateEnabled({ data: { templateId: t.id, enabled: !t.enabled } });
												router.invalidate();
											}}
										>
											{t.enabled ? "停用" : "启用"}
										</Button>
										<Button
											variant="ghost"
											size="icon"
											onClick={async () => {
												await deleteTemplate({ data: { templateId: t.id } });
												router.invalidate();
											}}
										>
											<Trash2 className="size-4" />
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</section>
			))}
		</div>
	);
}

function NewTemplate({ brandId, onDone }: { brandId: string; onDone: () => void }) {
	const [kind, setKind] = useState<"article" | "title">("article");
	const [name, setName] = useState("");
	const [channel, setChannel] = useState("");
	const [body, setBody] = useState("");
	const [busy, setBusy] = useState(false);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">新增指令</CardTitle>
				<CardDescription>渠道是可选的提示，比如公众号和官网各写一条，投放时按渠道取。</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-4 sm:grid-cols-3">
					<div className="space-y-2">
						<Label htmlFor="kind">类型</Label>
						<select
							id="kind"
							className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
							value={kind}
							onChange={(e) => setKind(e.target.value as "article" | "title")}
						>
							<option value="article">文章指令</option>
							<option value="title">标题指令</option>
						</select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="name">名称</Label>
						<Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="channel">渠道</Label>
						<Input id="channel" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="选填" />
					</div>
				</div>
				<div className="space-y-2">
					<Label htmlFor="body">指令内容</Label>
					<Textarea id="body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
				</div>
				<Button
					disabled={busy || !name.trim() || !body.trim()}
					onClick={async () => {
						setBusy(true);
						try {
							await createTemplate({ data: { brandId, kind, name, body, channel: channel || undefined } });
							setName("");
							setBody("");
							setChannel("");
							onDone();
						} finally {
							setBusy(false);
						}
					}}
				>
					保存
				</Button>
			</CardContent>
		</Card>
	);
}
