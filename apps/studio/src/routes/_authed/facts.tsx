import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { createFactBase, createFactEntry, deleteFactEntry, getFactBase, setFactEntryApproval } from "@/server/facts";

const FIELD_LABELS: Record<string, string> = {
	product_service: "产品与服务",
	product_feature: "产品特点",
	brand_story: "品牌故事",
	user_pain: "用户痛点",
	trust_credential: "信任背书",
	customer_case: "客户案例",
	capacity: "产能",
	certification: "认证",
	lead_time: "交期",
	pricing_basis: "价格构成",
	other: "其他",
};

export const Route = createFileRoute("/_authed/facts")({
	validateSearch: (search: Record<string, unknown>) => ({
		brand: typeof search.brand === "string" ? search.brand : undefined,
	}),
	loaderDeps: ({ search }) => ({ brand: search.brand }),
	loader: async ({ context, deps }) => {
		const brands = context.workspace.brands;
		const brandId = deps.brand ?? brands[0]?.id;
		if (!brandId) return { brands, brand: null, factBase: null };
		return {
			brands,
			brand: brands.find((b) => b.id === brandId) ?? null,
			factBase: await getFactBase({ data: { brandId } }),
		};
	},
	component: FactsPage,
});

function FactsPage() {
	const { brands, brand, factBase } = Route.useLoaderData();
	const router = useRouter();
	const navigate = Route.useNavigate();

	if (!brand) {
		return <Empty title="还没有品牌">先在监测平台建一个品牌，Studio 的事实库挂在品牌下面。</Empty>;
	}

	return (
		<div className="mx-auto max-w-4xl px-8 py-10">
			<header className="mb-8 flex items-start justify-between gap-6">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">事实库</h1>
					<p className="text-muted-foreground mt-2 max-w-prose text-sm">
						生成内容时的唯一事实来源。写进来的每一条都要有出处，模型只能引用这里的条目——库里没有的，它不许说。
					</p>
				</div>
				{brands.length > 1 && (
					<select
						className="border-input bg-background h-9 rounded-md border px-3 text-sm"
						value={brand.id}
						onChange={(e) => navigate({ search: { brand: e.target.value } })}
					>
						{brands.map((b) => (
							<option key={b.id} value={b.id}>
								{b.name}
							</option>
						))}
					</select>
				)}
			</header>

			{!factBase ? (
				<CreateBaseCard brandId={brand.id} brandName={brand.name} onDone={() => router.invalidate()} />
			) : (
				<>
					<AddEntryCard factBaseId={factBase.base.id} onDone={() => router.invalidate()} />
					<EntryList entries={factBase.entries} onChange={() => router.invalidate()} />
				</>
			)}
		</div>
	);
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="mx-auto max-w-4xl px-8 py-10">
			<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
			<p className="text-muted-foreground mt-2 text-sm">{children}</p>
		</div>
	);
}

function CreateBaseCard({ brandId, brandName, onDone }: { brandId: string; brandName: string; onDone: () => void }) {
	const [companyName, setCompanyName] = useState(brandName);
	const [shortName, setShortName] = useState("");
	const [busy, setBusy] = useState(false);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">建立事实库</CardTitle>
				<CardDescription>工商全称用于生成内容里的主体表述，简称用于正文行文。</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="company">公司全称</Label>
						<Input id="company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="short">简称</Label>
						<Input id="short" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="选填" />
					</div>
				</div>
				<Button
					disabled={busy || !companyName.trim()}
					onClick={async () => {
						setBusy(true);
						try {
							await createFactBase({ data: { brandId, companyName, shortName: shortName || undefined } });
							onDone();
						} finally {
							setBusy(false);
						}
					}}
				>
					建立
				</Button>
			</CardContent>
		</Card>
	);
}

function AddEntryCard({ factBaseId, onDone }: { factBaseId: string; onDone: () => void }) {
	const [field, setField] = useState<string>("product_service");
	const [content, setContent] = useState("");
	const [evidenceUrl, setEvidenceUrl] = useState("");
	const [validUntil, setValidUntil] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	return (
		<Card className="mb-6">
			<CardHeader>
				<CardTitle className="text-base">添加事实</CardTitle>
				<CardDescription>
					一条只写一个可核对的事实。产能、认证、交期这类会过期，填上有效期，过期后引用它的稿子会被拦下。
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-4 sm:grid-cols-3">
					<div className="space-y-2">
						<Label htmlFor="field">字段</Label>
						<select
							id="field"
							className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
							value={field}
							onChange={(e) => setField(e.target.value)}
						>
							{Object.entries(FIELD_LABELS).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="evidence">证据链接</Label>
						<Input
							id="evidence"
							value={evidenceUrl}
							onChange={(e) => setEvidenceUrl(e.target.value)}
							placeholder="选填"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="valid">有效期至</Label>
						<Input id="valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
					</div>
				</div>
				<div className="space-y-2">
					<Label htmlFor="content">内容</Label>
					<Textarea
						id="content"
						rows={3}
						value={content}
						onChange={(e) => setContent(e.target.value)}
						placeholder="例：月产能 8,000 套，工厂面积 50,000 平方米"
					/>
				</div>
				{error && <p className="text-destructive text-sm">{error}</p>}
				<Button
					disabled={busy || !content.trim()}
					onClick={async () => {
						setBusy(true);
						setError(null);
						try {
							await createFactEntry({
								data: {
									factBaseId,
									field: field as never,
									content,
									evidenceUrl: evidenceUrl || undefined,
									validUntil: validUntil || undefined,
								},
							});
							setContent("");
							setEvidenceUrl("");
							setValidUntil("");
							onDone();
						} catch (e) {
							setError(e instanceof Error ? e.message : "保存失败");
						} finally {
							setBusy(false);
						}
					}}
				>
					添加
				</Button>
			</CardContent>
		</Card>
	);
}

type Entry = {
	id: string;
	field: string;
	content: string;
	evidenceUrl: string | null;
	validUntil: Date | string | null;
	approved: boolean;
};

function EntryList({ entries, onChange }: { entries: Entry[]; onChange: () => void }) {
	if (entries.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">还没有条目。至少写满产品、特点、信任背书三类，生成才有东西可引。</p>
		);
	}

	const grouped = entries.reduce<Record<string, Entry[]>>((acc, entry) => {
		const bucket = acc[entry.field] ?? [];
		bucket.push(entry);
		acc[entry.field] = bucket;
		return acc;
	}, {});

	return (
		<div className="space-y-6">
			{Object.entries(grouped).map(([field, items]) => (
				<section key={field}>
					<h2 className="text-muted-foreground mb-2 font-mono text-xs tracking-widest uppercase">
						{FIELD_LABELS[field] ?? field}
					</h2>
					<div className="divide-y rounded-lg border">
						{items.map((entry) => (
							<EntryRow key={entry.id} entry={entry} onChange={onChange} />
						))}
					</div>
				</section>
			))}
		</div>
	);
}

function EntryRow({ entry, onChange }: { entry: Entry; onChange: () => void }) {
	const expired = entry.validUntil ? new Date(entry.validUntil) < new Date() : false;

	return (
		<div className="flex items-start justify-between gap-4 p-4">
			<div className="min-w-0">
				<p className="text-sm">{entry.content}</p>
				<div className="mt-2 flex flex-wrap items-center gap-2">
					{entry.approved ? <Badge variant="outline">已核准</Badge> : <Badge variant="secondary">待核准</Badge>}
					{expired && <Badge variant="destructive">已过期</Badge>}
					{entry.evidenceUrl ? (
						<a
							className="text-muted-foreground text-xs underline underline-offset-4"
							href={entry.evidenceUrl}
							target="_blank"
							rel="noreferrer"
						>
							证据
						</a>
					) : (
						<span className="text-muted-foreground text-xs">无证据链接</span>
					)}
				</div>
			</div>
			<div className="flex shrink-0 gap-1">
				<Button
					variant="ghost"
					size="icon"
					title={entry.approved ? "撤销核准" : "核准"}
					onClick={async () => {
						await setFactEntryApproval({ data: { entryId: entry.id, approved: !entry.approved } });
						onChange();
					}}
				>
					<Check className="size-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					title="删除"
					onClick={async () => {
						await deleteFactEntry({ data: { entryId: entry.id } });
						onChange();
					}}
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
		</div>
	);
}
