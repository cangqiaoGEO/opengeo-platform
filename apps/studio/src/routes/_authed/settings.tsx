import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { useState } from "react";
import { getGuardrails, updateGuardrail } from "@/server/guardrails";

export const Route = createFileRoute("/_authed/settings")({
	validateSearch: (search: Record<string, unknown>) => ({
		brand: typeof search.brand === "string" ? search.brand : undefined,
	}),
	loaderDeps: ({ search }) => ({ brand: search.brand }),
	loader: async ({ context, deps }) => {
		const brands = context.workspace.brands;
		const brandId = deps.brand ?? brands[0]?.id;
		if (!brandId) return { brandId: null, guardrails: null };
		return { brandId, guardrails: await getGuardrails({ data: { brandId } }) };
	},
	component: SettingsPage,
});

type Field = "requireReview" | "blockAdLawTerms" | "factBinding" | "enableTrafficClone";
type PendingValue = boolean | "strict" | "warn" | "off";

const SWITCHES: { field: Field; label: string; description: string; safe: boolean | string }[] = [
	{
		field: "requireReview",
		label: "发布前强制人工审核",
		description: "关掉之后，已生成的稿子可以不经人看就进入发布流程。",
		safe: true,
	},
	{
		field: "blockAdLawTerms",
		label: "绝对化用语拦截",
		description: "拦下「最」「第一」「唯一」「国家级」这类广告法敏感表述。",
		safe: true,
	},
	{
		field: "enableTrafficClone",
		label: "流量复刻",
		description: "复刻他人已验证有效的内容结构。默认关闭。",
		safe: false,
	},
];

function SettingsPage() {
	const { brandId, guardrails } = Route.useLoaderData();
	const router = useRouter();
	const [pending, setPending] = useState<{ field: Field; value: PendingValue } | null>(null);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);

	if (!brandId || !guardrails) return <p className="p-8 text-sm">先在监测平台建一个品牌。</p>;

	const { settings, history, relaxed } = guardrails;

	async function commit() {
		if (!pending || !brandId) return;
		setError(null);
		try {
			await updateGuardrail({ data: { brandId, field: pending.field, value: pending.value, reason } });
			setPending(null);
			setReason("");
			router.invalidate();
		} catch (e) {
			setError(e instanceof Error ? e.message : "保存失败");
		}
	}

	return (
		<div className="mx-auto max-w-4xl px-8 py-10">
			<header className="mb-8">
				<h1 className="text-2xl font-semibold tracking-tight">护栏设置</h1>
				<p className="text-muted-foreground mt-2 max-w-prose text-sm">
					这几项都可以关，但每一次改动都会记下是谁改的、为什么改。出事的时候要回答的是「当时的规则是什么」，不是「我们本来是怎么规定的」。
				</p>
			</header>

			{relaxed.length > 0 && (
				<div className="border-destructive bg-destructive/5 mb-6 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">当前处于放宽状态</p>
					<ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
						{relaxed.map((r) => (
							<li key={r}>{r}</li>
						))}
					</ul>
				</div>
			)}

			<div className="mb-6 divide-y rounded-lg border">
				{SWITCHES.map((s) => {
					const value = settings[s.field] as boolean;
					const isSafe = value === s.safe;
					return (
						<div key={s.field} className="flex items-start justify-between gap-4 p-4">
							<div>
								<div className="flex items-center gap-2">
									<p className="text-sm font-medium">{s.label}</p>
									{!isSafe && <Badge variant="destructive">已放宽</Badge>}
								</div>
								<p className="text-muted-foreground mt-1 text-xs">{s.description}</p>
							</div>
							<Button variant="ghost" size="sm" onClick={() => setPending({ field: s.field, value: !value })}>
								{value ? "关闭" : "开启"}
							</Button>
						</div>
					);
				})}
				<div className="flex items-start justify-between gap-4 p-4">
					<div>
						<div className="flex items-center gap-2">
							<p className="text-sm font-medium">事实绑定</p>
							{settings.factBinding !== "strict" && <Badge variant="destructive">已放宽</Badge>}
						</div>
						<p className="text-muted-foreground mt-1 text-xs">
							strict：无据说法拦下不放行 · warn：标出来但放行 · off：不检查
						</p>
					</div>
					<select
						className="border-input bg-background h-9 rounded-md border px-3 text-sm"
						value={settings.factBinding}
						onChange={(e) => setPending({ field: "factBinding", value: e.target.value as PendingValue })}
					>
						<option value="strict">strict</option>
						<option value="warn">warn</option>
						<option value="off">off</option>
					</select>
				</div>
			</div>

			{pending && (
				<Card className="mb-6">
					<CardHeader>
						<CardTitle className="text-base">写明改动原因</CardTitle>
						<CardDescription>
							{pending.field} → {String(pending.value)}。这句话会连同你的账号一起写进审计记录，删不掉。
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<Input
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="例：客户要求本批次不做敏感词拦截，已书面确认"
						/>
						{error && <p className="text-destructive text-sm">{error}</p>}
						<div className="flex gap-2">
							<Button disabled={!reason.trim()} onClick={commit}>
								确认改动
							</Button>
							<Button
								variant="ghost"
								onClick={() => {
									setPending(null);
									setReason("");
									setError(null);
								}}
							>
								取消
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			<section>
				<h2 className="text-muted-foreground mb-2 font-mono text-xs tracking-widest uppercase">审计记录</h2>
				{history.length === 0 ? (
					<p className="text-muted-foreground text-sm">还没有人改过护栏。</p>
				) : (
					<div className="divide-y rounded-lg border">
						{history.map((h) => (
							<div key={h.id} className="p-4 text-sm">
								<p>
									<span className="font-mono text-xs">{h.field}</span>：{h.fromValue} → {h.toValue}
								</p>
								<p className="text-muted-foreground mt-1 text-xs">
									{new Date(h.createdAt).toLocaleString("zh-CN")} · {h.reason}
								</p>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
