import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteAsset, listAssets, updateAssetAlt } from "@/server/assets";

export const Route = createFileRoute("/_authed/assets")({
	validateSearch: (search: Record<string, unknown>) => ({
		brand: typeof search.brand === "string" ? search.brand : undefined,
		kind: search.kind === "video" || search.kind === "text" ? (search.kind as "video" | "text") : ("image" as const),
		category: typeof search.category === "string" ? search.category : undefined,
		page: typeof search.page === "number" && search.page > 0 ? search.page : 1,
	}),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const brands = context.workspace.brands;
		const brandId = deps.brand ?? brands[0]?.id;
		if (!brandId) return null;
		return {
			brandId,
			kind: deps.kind,
			category: deps.category,
			...(await listAssets({ data: { brandId, kind: deps.kind, category: deps.category, page: deps.page } })),
		};
	},
	component: AssetsPage,
});

function AssetsPage() {
	const data = Route.useLoaderData();
	const navigate = Route.useNavigate();
	const router = useRouter();

	if (!data) return <p className="p-8 text-sm">先在监测平台建一个品牌。</p>;
	const { rows, facets, totals, kind, category, page, pageSize, matching } = data;
	const lastPage = Math.max(1, Math.ceil(matching / pageSize));
	const first = matching === 0 ? 0 : (page - 1) * pageSize + 1;
	const last = Math.min(page * pageSize, matching);
	const categories = facets.filter((f) => f.kind === kind).sort((a, b) => b.value - a.value);

	return (
		<div className="mx-auto max-w-5xl px-8 py-10">
			<header className="mb-6">
				<h1 className="text-2xl font-semibold tracking-tight">素材库</h1>
				<p className="text-muted-foreground mt-2 max-w-prose text-sm">
					从官网抓来的图片、视频与文案，按来源页分类。素材只存链接不存副本——官网换了图，这里指向的就是新的那张。
				</p>
				<div className="text-muted-foreground mt-3 flex flex-wrap gap-4 font-mono text-xs">
					<span>图片 {totals.images}</span>
					<span>视频 {totals.videos}</span>
					<span>文案 {totals.texts}</span>
					{totals.missingAlt > 0 && <span className="text-amber-600">缺 alt 文本 {totals.missingAlt}</span>}
				</div>
			</header>

			<div className="mb-4 flex flex-wrap items-center gap-2">
				{(["image", "video", "text"] as const).map((k) => (
					<Button
						key={k}
						size="sm"
						variant={kind === k ? "default" : "ghost"}
						onClick={() => navigate({ search: (s) => ({ ...s, kind: k, category: undefined, page: 1 }) })}
					>
						{k === "image" ? "图片" : k === "video" ? "视频" : "文案"}
					</Button>
				))}
				<span className="bg-border mx-2 h-4 w-px" />
				<Button
					size="sm"
					variant={!category ? "secondary" : "ghost"}
					onClick={() => navigate({ search: (s) => ({ ...s, category: undefined, page: 1 }) })}
				>
					全部
				</Button>
				{categories.map((c) => (
					<Button
						key={c.category}
						size="sm"
						variant={category === c.category ? "secondary" : "ghost"}
						onClick={() => navigate({ search: (s) => ({ ...s, category: c.category, page: 1 }) })}
					>
						{c.category} <span className="text-muted-foreground ml-1">{c.value}</span>
					</Button>
				))}
			</div>

			{rows.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					这一类还没有素材。跑 <code className="text-xs">scripts/import-site-assets.ts</code> 从官网导入。
				</p>
			) : kind === "text" ? (
				<div className="divide-y rounded-lg border">
					{rows.map((a) => (
						<div key={a.id} className="p-4">
							<div className="flex items-start justify-between gap-4">
								<p className="text-sm font-medium">{a.title}</p>
								<Badge variant="outline">{a.category}</Badge>
							</div>
							<p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">{a.content}</p>
							{a.sourceUrl && (
								<a
									className="text-muted-foreground mt-2 inline-block text-xs underline underline-offset-2"
									href={a.sourceUrl}
									target="_blank"
									rel="noreferrer"
								>
									来源页
								</a>
							)}
						</div>
					))}
				</div>
			) : kind === "video" ? (
				<div className="space-y-3">
					{rows.map((a) => {
						const embedded = /youtube|youtu\.be|vimeo|bilibili/i.test(a.fileUrl ?? "");
						return (
							<div key={a.id} className="rounded-lg border p-4">
								<div className="flex items-start justify-between gap-4">
									<div className="min-w-0">
										<a
											className="text-sm break-all underline underline-offset-2"
											href={a.fileUrl ?? "#"}
											target="_blank"
											rel="noreferrer"
										>
											{a.fileUrl}
										</a>
										<p className="text-muted-foreground mt-1 text-xs">{a.category}</p>
									</div>
									{a.localPath ? (
										<Badge>已存本地 · {((a.sizeBytes ?? 0) / 1024 / 1024).toFixed(1)} MB</Badge>
									) : embedded ? (
										<Badge variant="secondary">需向客户索取原片</Badge>
									) : (
										<Badge variant="outline">仅引用</Badge>
									)}
								</div>
								{a.localPath && (
									// biome-ignore lint/a11y/useMediaCaption: 客户原片，字幕由客户提供
									<video
										className="mt-3 w-full max-w-md rounded-md"
										controls
										preload="metadata"
										src={`/media/${a.localPath}`}
									/>
								)}
								{!a.localPath && embedded && (
									<p className="text-muted-foreground mt-2 text-xs">
										平台嵌入的播放页不抓取——那既违反对方条款，拿到的也是转码版。发到公众号或视频号需要原始文件，向客户索取。
									</p>
								)}
							</div>
						);
					})}
				</div>
			) : (
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
					{rows.map((a) => (
						<ImageCard key={a.id} asset={a} onChange={() => router.invalidate()} />
					))}
				</div>
			)}
			{matching > pageSize && (
				<nav className="mt-6 flex items-center justify-between border-t pt-4 text-sm">
					<span className="text-muted-foreground font-mono text-xs">
						第 {first}–{last} 张，共 {matching}
					</span>
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							variant="ghost"
							disabled={page <= 1}
							onClick={() => navigate({ search: (s) => ({ ...s, page: page - 1 }) })}
						>
							上一页
						</Button>
						<span className="text-muted-foreground font-mono text-xs">
							{page} / {lastPage}
						</span>
						<Button
							size="sm"
							variant="ghost"
							disabled={page >= lastPage}
							onClick={() => navigate({ search: (s) => ({ ...s, page: page + 1 }) })}
						>
							下一页
						</Button>
					</div>
				</nav>
			)}
		</div>
	);
}

type AssetRow = {
	id: string;
	fileUrl: string | null;
	altText: string | null;
	category: string;
	sourceUrl: string | null;
};

function ImageCard({ asset, onChange }: { asset: AssetRow; onChange: () => void }) {
	const [alt, setAlt] = useState(asset.altText ?? "");
	const [editing, setEditing] = useState(false);

	return (
		<figure className="overflow-hidden rounded-lg border">
			<img
				src={asset.fileUrl ?? ""}
				alt={asset.altText ?? ""}
				loading="lazy"
				className="bg-muted aspect-square w-full object-cover"
			/>
			<figcaption className="space-y-2 p-3">
				{editing ? (
					<div className="space-y-2">
						<Input
							value={alt}
							onChange={(e) => setAlt(e.target.value)}
							placeholder="alt 文本"
							className="h-8 text-xs"
						/>
						<div className="flex gap-1">
							<Button
								size="sm"
								className="h-7 text-xs"
								onClick={async () => {
									await updateAssetAlt({ data: { assetId: asset.id, altText: alt } });
									setEditing(false);
									onChange();
								}}
							>
								保存
							</Button>
							<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
								取消
							</Button>
						</div>
					</div>
				) : (
					<button type="button" className="w-full text-left" onClick={() => setEditing(true)}>
						{asset.altText ? (
							<p className="line-clamp-2 text-xs">{asset.altText}</p>
						) : (
							<p className="text-xs text-amber-600">缺 alt 文本，点这里补</p>
						)}
					</button>
				)}
				<div className="flex items-center justify-between">
					<Badge variant="outline" className="text-[10px]">
						{asset.category}
					</Badge>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={async () => {
							await deleteAsset({ data: { assetId: asset.id } });
							onChange();
						}}
					>
						<Trash2 className="size-3.5" />
					</Button>
				</div>
			</figcaption>
		</figure>
	);
}
