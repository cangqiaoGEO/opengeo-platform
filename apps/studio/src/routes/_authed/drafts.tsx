import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { useState } from "react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { getDraft, reviewDraft } from "@/server/review";
import { listDrafts } from "@/server/tasks";

const BLOCK_REASONS: Record<string, string> = {
	unsupported_claims: "有事实库支撑不了的说法",
	ad_law_terms: "含绝对化用语",
	language_mismatch: "语言与目标问题不一致",
};

/**
 * The model cites entries by id, which is what makes the binding checkable —
 * and unreadable. It writes the marker three different ways depending on the
 * brief it followed, so all of them collapse to the number of the source in the
 * list under the article: the reviewer reads prose with footnotes.
 */
function withFootnotes(body: string): string {
	const order: string[] = [];
	const numberFor = (id: string) => {
		let index = order.indexOf(id);
		if (index === -1) {
			order.push(id);
			index = order.length - 1;
		}
		return index + 1;
	};

	return body.replace(
		/\[(?:id=)?((?:[0-9a-f-]{36})(?:\s*[,、]\s*(?:id=)?[0-9a-f-]{36})*)\]/g,
		(_match, ids: string) => {
			const numbers = ids
				.split(/[,、]/)
				.map((raw) => raw.replace(/id=/, "").trim())
				.filter((id) => id.length === 36)
				.map(numberFor);
			return numbers.length ? `<sup class="citation">[${numbers.join(",")}]</sup>` : "";
		},
	);
}

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
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

type Detail = Awaited<ReturnType<typeof getDraft>>;

function DraftsPage() {
	const { drafts } = Route.useLoaderData();
	const router = useRouter();
	const [detail, setDetail] = useState<Detail | null>(null);
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);

	async function open(draftId: string) {
		setError(null);
		setNote("");
		setDetail(detail?.draft.id === draftId ? null : await getDraft({ data: { draftId } }));
	}

	async function decide(draftId: string, action: "approve" | "reject") {
		setError(null);
		try {
			await reviewDraft({ data: { draftId, action, note: note || undefined } });
			setDetail(null);
			setNote("");
			router.invalidate();
		} catch (e) {
			setError(e instanceof Error ? e.message : "操作失败");
		}
	}

	return (
		<div className="mx-auto max-w-4xl px-8 py-10">
			<header className="mb-8">
				<h1 className="text-2xl font-semibold tracking-tight">草稿与审核</h1>
				<p className="text-muted-foreground mt-2 max-w-prose text-sm">
					「待补事实」不是失败，是活儿：模型写了事实库支撑不了的话，那句要么找到证据补进事实库，要么从正文里去掉。
				</p>
			</header>

			{drafts.length === 0 ? (
				<p className="text-muted-foreground text-sm">还没有草稿，去创作任务生成。</p>
			) : (
				<div className="space-y-3">
					{drafts.map((d) => {
						const status = STATUS[d.status] ?? { label: d.status, variant: "secondary" as const };
						const isOpen = detail?.draft.id === d.id;
						return (
							<Card key={d.id}>
								<CardHeader className="cursor-pointer" onClick={() => open(d.id)}>
									<div className="flex items-start justify-between gap-4">
										<CardTitle className="text-base leading-snug">{d.title}</CardTitle>
										<Badge variant={status.variant}>{status.label}</Badge>
									</div>
									<div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
										<span className="underline underline-offset-2">{isOpen ? "收起原稿" : "查看原稿"}</span>
										<span>{d.modelVersion}</span>
										{d.blockReasons?.map((r) => (
											<span key={r} className="text-destructive">
												{BLOCK_REASONS[r] ?? r}
											</span>
										))}
										{d.unsupportedClaims.length > 0 && (
											<span className="text-destructive">{d.unsupportedClaims.length} 条无据说法</span>
										)}
										{d.flaggedTerms.length > 0 && (
											<span className="text-amber-600">敏感词：{d.flaggedTerms.join("、")}</span>
										)}
									</div>
								</CardHeader>

								{isOpen && detail && (
									<CardContent className="space-y-5">
										{detail.draft.unsupportedClaims.length > 0 && (
											<div className="border-destructive/40 bg-destructive/5 rounded-md border p-3">
												<p className="text-destructive mb-2 text-xs font-medium">事实库支撑不了这些说法</p>
												<ul className="list-disc space-y-1 pl-4 text-sm">
													{detail.draft.unsupportedClaims.map((c, i) => (
														<li key={i}>{c}</li>
													))}
												</ul>
											</div>
										)}

										{detail.citations.length > 0 && (
											<div>
												<p className="text-muted-foreground mb-2 font-mono text-xs tracking-widest uppercase">
													引用了 {detail.citations.length} 条事实（正文角标与此处编号对应）
												</p>
												<div className="divide-y rounded-md border text-sm">
													{detail.citations.map((c, i) => (
														<div key={i} className="p-3">
															<p>
																<span className="text-muted-foreground mr-2 font-mono text-xs">[{i + 1}]</span>
																{c.claim}
															</p>
															<p className="text-muted-foreground mt-1 text-xs">
																← [{c.entryField}] {c.entryContent}
																{!c.approved && <span className="text-amber-600"> · 该条尚未核准</span>}
																{c.evidenceUrl && (
																	<>
																		{" · "}
																		<a
																			className="underline underline-offset-2"
																			href={c.evidenceUrl}
																			target="_blank"
																			rel="noreferrer"
																		>
																			证据
																		</a>
																	</>
																)}
															</p>
														</div>
													))}
												</div>
											</div>
										)}

										<article className="prose prose-sm prose-draft dark:prose-invert max-w-none">
											<Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
												{withFootnotes(detail.draft.body)}
											</Markdown>
										</article>

										{detail.history.length > 0 && (
											<div className="text-muted-foreground space-y-1 text-xs">
												{detail.history.map((h) => (
													<p key={h.id}>
														{new Date(h.createdAt).toLocaleString("zh-CN")} · {h.action}
														{h.note ? ` · ${h.note}` : ""}
													</p>
												))}
											</div>
										)}

										<div className="flex gap-2 border-t pt-4">
											<Button
												size="sm"
												variant="ghost"
												onClick={() => navigator.clipboard.writeText(`# ${detail.draft.title}\n\n${detail.draft.body}`)}
											>
												复制原文
											</Button>
										</div>

										{(d.status === "pending_review" || d.status === "needs_facts") && (
											<div className="space-y-2 border-t pt-4">
												<Input
													value={note}
													onChange={(e) => setNote(e.target.value)}
													placeholder={
														d.status === "needs_facts" ? "通过这篇必须写明理由（会记进审核记录）" : "审核意见，选填"
													}
												/>
												{error && <p className="text-destructive text-sm">{error}</p>}
												<div className="flex gap-2">
													<Button onClick={() => decide(d.id, "approve")}>通过</Button>
													<Button variant="ghost" onClick={() => decide(d.id, "reject")}>
														打回
													</Button>
												</div>
											</div>
										)}
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
