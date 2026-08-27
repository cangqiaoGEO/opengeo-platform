import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { getAttribution } from "@/server/attribution";

export const Route = createFileRoute("/_authed/attribution")({
	validateSearch: (search: Record<string, unknown>) => ({
		brand: typeof search.brand === "string" ? search.brand : undefined,
	}),
	loaderDeps: ({ search }) => ({ brand: search.brand }),
	loader: async ({ context, deps }) => {
		const brands = context.workspace.brands;
		const brandId = deps.brand ?? brands[0]?.id;
		if (!brandId) return null;
		return { brandId, ...(await getAttribution({ data: { brandId } })) };
	},
	component: AttributionPage,
});

const VERDICT: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
	cited: { label: "✅ 被引", variant: "default" },
	not_cited: { label: "未被引", variant: "destructive" },
	no_runs_yet: { label: "尚无发布后轮次", variant: "secondary" },
	no_url: { label: "无 URL", variant: "outline" },
};

function AttributionPage() {
	const data = Route.useLoaderData();
	if (!data) return <p className="p-8 text-sm">先在监测平台建一个品牌。</p>;
	const { verdicts, runsTotal } = data;

	return (
		<div className="mx-auto max-w-4xl px-8 py-10">
			<header className="mb-8">
				<h1 className="text-2xl font-semibold tracking-tight">归因</h1>
				<p className="text-muted-foreground mt-2 max-w-prose text-sm">
					发布不等于生效——只有 AI 在下一轮真实回答里引用了它，才算数。每条发布记录对照发布之后的测评轮次核对引用。
				</p>
			</header>

			{verdicts.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">还没有发布记录</CardTitle>
						<CardDescription>在「分发与回收」登记发布并填上 URL，下一轮测评后这里给出判决。</CardDescription>
					</CardHeader>
				</Card>
			) : (
				<div className="space-y-3">
					{verdicts.map((v) => {
						const badge = VERDICT[v.verdict] ?? VERDICT.no_url;
						return (
							<Card key={v.recordId}>
								<CardContent className="flex items-start justify-between gap-4 py-4">
									<div className="min-w-0">
										<p className="truncate text-sm font-medium">{v.draftTitle ?? v.url ?? v.recordId}</p>
										<p className="text-muted-foreground mt-1 text-xs">
											{v.channel} · 发布于 {new Date(v.publishedAt).toLocaleDateString()} · 之后跑了 {v.runsAfter} 轮
											{v.url && (
												<>
													{" · "}
													<a className="underline underline-offset-4" href={v.url} target="_blank" rel="noreferrer">
														链接
													</a>
												</>
											)}
										</p>
										{v.verdict === "cited" && (
											<p className="text-muted-foreground mt-1 text-xs">
												发布后被引 {v.citedAfter} 次（此前 {v.citedBefore}）· 引擎：{v.models.join(" · ")} · 首次被引{" "}
												{v.firstCitedAt ? new Date(v.firstCitedAt).toLocaleString() : "—"}
											</p>
										)}
									</div>
									<Badge variant={badge.variant} className="shrink-0">
										{badge.label}
									</Badge>
								</CardContent>
							</Card>
						);
					})}
					<p className="text-muted-foreground text-xs">
						库内测评 run 共 {runsTotal} 轮。判决同时以 markdown 写回品牌 bundle 的 reports/attribution/（机器生成，人不手改）。
					</p>
				</div>
			)}
		</div>
	);
}
