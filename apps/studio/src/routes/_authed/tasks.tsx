import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { createTask, generateNextDraft, getTaskWorkspace } from "@/server/tasks";

export const Route = createFileRoute("/_authed/tasks")({
	validateSearch: (search: Record<string, unknown>) => ({
		brand: typeof search.brand === "string" ? search.brand : undefined,
	}),
	loaderDeps: ({ search }) => ({ brand: search.brand }),
	loader: async ({ context, deps }) => {
		const brands = context.workspace.brands;
		const brandId = deps.brand ?? brands[0]?.id;
		if (!brandId) return { brandId: null, workspace: null };
		return { brandId, workspace: await getTaskWorkspace({ data: { brandId } }) };
	},
	component: TasksPage,
});

type LogLine = { text: string; tone: "ok" | "warn" | "err" };

function TasksPage() {
	const { brandId, workspace } = Route.useLoaderData();
	const router = useRouter();
	const [name, setName] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const [draftCount, setDraftCount] = useState(3);
	const [imagesPerDraft, setImagesPerDraft] = useState(2);
	const [running, setRunning] = useState(false);
	const [log, setLog] = useState<LogLine[]>([]);

	if (!brandId || !workspace) return <p className="p-8 text-sm">先在监测平台建一个品牌。</p>;

	const blocked: string[] = [];
	if (!workspace.hasFactBase) blocked.push("还没有事实库");
	if (!workspace.templates.some((t) => t.kind === "article")) blocked.push("缺文章指令");
	if (!workspace.templates.some((t) => t.kind === "title")) blocked.push("缺标题指令");
	if (workspace.prompts.length === 0) blocked.push("监测平台里还没有追踪问题");

	async function run(taskId: string, total: number) {
		setRunning(true);
		for (let i = 0; i < total; i++) {
			try {
				const r = await generateNextDraft({ data: { taskId } });
				if (!r) break;
				const tone: LogLine["tone"] = r.status === "pending_review" ? "ok" : "warn";
				setLog((l) => [
					...l,
					{
						tone,
						text: `${r.title} — 引用 ${r.citations} 处${r.unsupported ? `，${r.unsupported} 条无据说法` : ""}${
							r.flaggedTerms.length ? `，敏感词 ${r.flaggedTerms.join("/")}` : ""
						}${r.status === "needs_facts" ? "（已拦下，待补事实）" : ""}`,
					},
				]);
			} catch (e) {
				setLog((l) => [...l, { tone: "err", text: e instanceof Error ? e.message : "生成失败" }]);
				break;
			}
		}
		setRunning(false);
		router.invalidate();
	}

	return (
		<div className="mx-auto max-w-4xl px-8 py-10">
			<header className="mb-8">
				<h1 className="text-2xl font-semibold tracking-tight">创作任务</h1>
				<p className="text-muted-foreground mt-2 max-w-prose text-sm">
					选中监测平台里的追踪问题，为它们写文章。一次生成一篇，边生成边显示引用了几处事实——这样中途不对劲可以立刻停。
				</p>
			</header>

			{blocked.length > 0 && (
				<Card className="mb-6">
					<CardHeader>
						<CardTitle className="text-base">还不能生成</CardTitle>
						<CardDescription>{blocked.join("；")}</CardDescription>
					</CardHeader>
				</Card>
			)}

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="text-base">新建任务</CardTitle>
					<CardDescription>优先挑那些监测里还没命中的问题——那才是缺口。已选 {selected.length} 个问题。</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-3">
						<div className="space-y-2">
							<Label htmlFor="taskname">任务名</Label>
							<Input id="taskname" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：9月第一批" />
						</div>
						<div className="space-y-2">
							<Label htmlFor="images">每篇配图</Label>
							<Input
								id="images"
								type="number"
								min={0}
								max={6}
								value={imagesPerDraft}
								onChange={(e) => setImagesPerDraft(Number(e.target.value))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="count">生成篇数</Label>
							<Input
								id="count"
								type="number"
								min={1}
								max={20}
								value={draftCount}
								onChange={(e) => setDraftCount(Number(e.target.value))}
							/>
						</div>
					</div>

					<div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-3">
						{workspace.prompts.map((p) => (
							<label key={p.id} className="flex cursor-pointer items-start gap-2 text-sm">
								<input
									type="checkbox"
									className="mt-1"
									checked={selected.includes(p.id)}
									onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))}
								/>
								<span>
									{p.value}
									{p.tags.length > 0 && (
										<span className="text-muted-foreground ml-2 text-xs">{p.tags.join(" · ")}</span>
									)}
								</span>
							</label>
						))}
					</div>

					<Button
						disabled={running || blocked.length > 0 || !name.trim() || selected.length === 0}
						onClick={async () => {
							setLog([]);
							const task = await createTask({
								data: { brandId, name, promptIds: selected, draftCount, imagesPerDraft },
							});
							await run(task.id, draftCount);
						}}
					>
						{running ? "生成中…" : `生成 ${draftCount} 篇`}
					</Button>

					{log.length > 0 && (
						<div className="space-y-1 rounded-md border p-3 font-mono text-xs">
							{log.map((line, i) => (
								<p
									key={i}
									className={
										line.tone === "ok"
											? "text-foreground"
											: line.tone === "warn"
												? "text-amber-600"
												: "text-destructive"
									}
								>
									{line.text}
								</p>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<section>
				<h2 className="text-muted-foreground mb-2 font-mono text-xs tracking-widest uppercase">历史任务</h2>
				{workspace.tasks.length === 0 ? (
					<p className="text-muted-foreground text-sm">还没有任务。</p>
				) : (
					<div className="divide-y rounded-lg border">
						{workspace.tasks.map((t) => (
							<div key={t.id} className="flex items-center justify-between gap-4 p-4">
								<div>
									<p className="text-sm font-medium">{t.name}</p>
									<p className="text-muted-foreground text-xs">
										{t.promptIds.length} 个问题 · 事实绑定 {t.guardrails.factBinding}
										{t.guardrails.blockAdLawTerms ? " · 敏感词拦截开" : " · 敏感词拦截关"}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Badge variant="outline">
										{t.drafted}/{t.draftCount} 篇
									</Badge>
									{t.drafted < t.draftCount && (
										<Button
											size="sm"
											variant="ghost"
											disabled={running}
											onClick={() => run(t.id, t.draftCount - t.drafted)}
										>
											继续
										</Button>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
