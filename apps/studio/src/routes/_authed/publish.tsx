import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Download } from "lucide-react";
import { useState } from "react";
import { exportDraft, getPublishBoard, recordPublish, setPublishedUrl } from "@/server/publish";

export const Route = createFileRoute("/_authed/publish")({
	validateSearch: (search: Record<string, unknown>) => ({
		brand: typeof search.brand === "string" ? search.brand : undefined,
	}),
	loaderDeps: ({ search }) => ({ brand: search.brand }),
	loader: async ({ context, deps }) => {
		const brands = context.workspace.brands;
		const brandId = deps.brand ?? brands[0]?.id;
		if (!brandId) return null;
		return { brandId, ...(await getPublishBoard({ data: { brandId } })) };
	},
	component: PublishPage,
});

function PublishPage() {
	const data = Route.useLoaderData();
	const router = useRouter();
	const [urlFor, setUrlFor] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);

	if (!data) return <p className="p-8 text-sm">先在监测平台建一个品牌。</p>;
	const { approved, records } = data;

	async function download(draftId: string) {
		const pkg = await exportDraft({ data: { draftId } });
		const blob = new Blob([pkg.markdown], { type: "text/markdown;charset=utf-8" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = pkg.filename;
		link.click();
		URL.revokeObjectURL(link.href);
		await recordPublish({ data: { draftId, channel: "export" } });
		router.invalidate();
	}

	const awaitingUrl = records.filter((r) => !r.url).length;

	return (
		<div className="mx-auto max-w-4xl px-8 py-10">
			<header className="mb-8">
				<h1 className="text-2xl font-semibold tracking-tight">分发与回收</h1>
				<p className="text-muted-foreground mt-2 max-w-prose text-sm">
					导出发布包，发出去之后把 URL 填回来。填了
					URL，这篇才会去和监测侧真实抓到的引用做比对——发出去和被读到，是两回事。
				</p>
				{awaitingUrl > 0 && (
					<p className="mt-3 text-sm text-amber-600">{awaitingUrl} 篇已导出但还没填发布地址，它们暂时无法被验证。</p>
				)}
			</header>

			<Card className="mb-8">
				<CardHeader>
					<CardTitle className="text-base">待发布</CardTitle>
					<CardDescription>
						审核通过的稿子。导出的是带 front matter 的 Markdown，附事实依据与出处，便于存档。
					</CardDescription>
				</CardHeader>
				<CardContent>
					{approved.length === 0 ? (
						<p className="text-muted-foreground text-sm">没有已通过的稿子。去草稿页审核。</p>
					) : (
						<div className="divide-y">
							{approved.map((d) => (
								<div key={d.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
									<p className="text-sm">{d.title}</p>
									<Button size="sm" variant="ghost" onClick={() => download(d.id)}>
										<Download className="mr-1 size-4" /> 导出发布包
									</Button>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<section>
				<h2 className="text-muted-foreground mb-2 font-mono text-xs tracking-widest uppercase">发布记录</h2>
				{records.length === 0 ? (
					<p className="text-muted-foreground text-sm">还没有发布记录。</p>
				) : (
					<div className="divide-y rounded-lg border">
						{records.map((r) => (
							<div key={r.id} className="space-y-2 p-4">
								<div className="flex items-start justify-between gap-4">
									<p className="text-sm font-medium">{r.title}</p>
									<div className="flex shrink-0 items-center gap-2">
										<Badge variant="outline">{r.channel}</Badge>
										{r.citedBy.length > 0 ? (
											<Badge>已被引用 · {r.citedBy.join("、")}</Badge>
										) : r.url ? (
											<Badge variant="secondary">尚未被引用</Badge>
										) : (
											<Badge variant="secondary">待填地址</Badge>
										)}
									</div>
								</div>
								<p className="text-muted-foreground text-xs">
									{new Date(r.publishedAt).toLocaleString("zh-CN")}
									{r.note ? ` · ${r.note}` : ""}
								</p>
								{r.url ? (
									<a
										className="text-xs break-all underline underline-offset-2"
										href={r.url}
										target="_blank"
										rel="noreferrer"
									>
										{r.url}
									</a>
								) : (
									<div className="flex gap-2">
										<Input
											className="h-8 text-xs"
											placeholder="发布后的公开地址，例如 https://www.pandasofa.com/blog/…"
											value={urlFor[r.id] ?? ""}
											onChange={(e) => setUrlFor((m) => ({ ...m, [r.id]: e.target.value }))}
										/>
										<Button
											size="sm"
											className="h-8"
											onClick={async () => {
												setError(null);
												try {
													await setPublishedUrl({ data: { recordId: r.id, url: urlFor[r.id] ?? "" } });
													router.invalidate();
												} catch (e) {
													setError(e instanceof Error ? e.message : "保存失败");
												}
											}}
										>
											保存
										</Button>
									</div>
								)}
							</div>
						))}
						{error && <p className="text-destructive p-4 text-sm">{error}</p>}
					</div>
				)}
			</section>
		</div>
	);
}
