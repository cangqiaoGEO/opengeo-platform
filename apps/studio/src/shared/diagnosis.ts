/**
 * Six-dimension diagnosis score (METRICS.md 指标宪章, 诊断分层).
 *
 * Pure scoring over aggregates the caller measured elsewhere. Every dimension
 * declares its method: "measured" comes straight from telemetry, "proxy" is an
 * experimental approximation the charter requires us to label as such (情感
 * 将换 LLM judge，推荐度将换真实推荐位解析).
 */

export interface SiteChecks {
	reachable: boolean;
	robotsOk: boolean;
	sitemap: boolean;
	llms: boolean;
}

export interface DiagnosisInput {
	runsTotal: number;
	brandMentionedRuns: number;
	sov: number | null; // 品牌 ÷ (品牌+竞品)，分母 0 为 null
	promptsTotal: number;
	promptsCovered: number; // 有过品牌提及的问题数
	citationsTotal: number;
	brandCitations: number; // 引用指向品牌自有域名的条数
	citationDomains: number; // 去重来源域名数
	warnFacts: number; // 未解决的 ⚠️ 错误归因/矛盾条目
	site: SiteChecks;
}

export interface Dimension {
	key: string;
	label: string;
	weight: number;
	score: number; // 0–100
	method: "measured" | "proxy";
	evidence: string;
}

export interface Diagnosis {
	dimensions: Dimension[];
	composite: number; // 0–100 加权
	grade: "A" | "B" | "C" | "D";
	actions: { priority: "P0" | "P1" | "P2"; text: string }[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

export function diagnose(i: DiagnosisInput): Diagnosis {
	const mentionRate = pct(i.brandMentionedRuns, i.runsTotal);
	const siteChecks = [i.site.reachable, i.site.robotsOk, i.site.sitemap, i.site.llms];
	const sitePassed = siteChecks.filter(Boolean).length;

	const dimensions: Dimension[] = [
		{
			key: "visibility",
			label: "可见度",
			weight: 30,
			score: clamp(mentionRate),
			method: "measured",
			evidence: `${i.runsTotal} 轮测评中被提及 ${i.brandMentionedRuns} 轮（${mentionRate.toFixed(1)}%）`,
		},
		{
			key: "recommendation",
			label: "推荐度",
			weight: 20,
			score: clamp((i.sov ?? 0) * 100),
			method: "proxy",
			evidence:
				i.sov === null
					? "SoV 分母为 0（无品牌或竞品提及），暂按 0 计"
					: `以 SoV ${(i.sov * 100).toFixed(1)}% 为推荐度代理（待推荐位解析替换）`,
		},
		{
			key: "citation_quality",
			label: "引用源质量",
			weight: 15,
			score: clamp(pct(i.brandCitations, i.citationsTotal) * 0.6 + Math.min(i.citationDomains, 10) * 4),
			method: "proxy",
			evidence: `${i.citationsTotal} 条引用中自有域名 ${i.brandCitations} 条；来源域名 ${i.citationDomains} 个`,
		},
		{
			key: "coverage",
			label: "信息覆盖度",
			weight: 15,
			score: clamp(pct(i.promptsCovered, i.promptsTotal)),
			method: "proxy",
			evidence: `${i.promptsTotal} 个追踪问题中 ${i.promptsCovered} 个出现过品牌（问题集广度代理）`,
		},
		{
			key: "sentiment",
			label: "情感倾向",
			weight: 10,
			score: clamp(100 - Math.min(i.warnFacts * 15, 70)),
			method: "proxy",
			evidence:
				i.warnFacts === 0
					? "无未解决的错误归因/矛盾条目"
					: `事实库存在 ${i.warnFacts} 条未解决的 ⚠️ 错误归因/矛盾（每条扣 15，封顶 70；待 LLM judge 替换）`,
		},
		{
			key: "foundation",
			label: "内容基础",
			weight: 10,
			score: clamp(pct(sitePassed, siteChecks.length)),
			method: "measured",
			evidence: `站点检查 ${sitePassed}/4：可访问 ${i.site.reachable ? "✓" : "✗"} · robots ${i.site.robotsOk ? "✓" : "✗"} · sitemap ${i.site.sitemap ? "✓" : "✗"} · llms.txt ${i.site.llms ? "✓" : "✗"}`,
		},
	];

	const composite = dimensions.reduce((sum, d) => sum + (d.score * d.weight) / 100, 0);
	const grade = composite >= 85 ? "A" : composite >= 70 ? "B" : composite >= 50 ? "C" : "D";

	const actions: Diagnosis["actions"] = [];
	for (const d of dimensions) {
		if (d.score < 40) actions.push({ priority: "P0", text: `${d.label}（${d.score.toFixed(0)} 分）：${prescribe(d.key)}` });
		else if (d.score < 70)
			actions.push({ priority: "P1", text: `${d.label}（${d.score.toFixed(0)} 分）：${prescribe(d.key)}` });
	}
	if (!i.site.llms) actions.push({ priority: "P2", text: "部署 llms.txt（见 opengeo-agentready 清单）" });
	if (!i.site.sitemap) actions.push({ priority: "P1", text: "补 sitemap.xml 并提交主流 AI 爬虫可读" });
	if (i.warnFacts > 0) actions.push({ priority: "P0", text: `发布纠错信源，消除 ${i.warnFacts} 条 AI 错误归因（H3 假设路径）` });

	const order = { P0: 0, P1: 1, P2: 2 };
	actions.sort((a, b) => order[a.priority] - order[b.priority]);
	return { dimensions, composite: Math.round(composite * 10) / 10, grade, actions };
}

function prescribe(key: string): string {
	switch (key) {
		case "visibility":
			return "L1–L3 无指向性问题缺席——按 playbook 补主题页与选品指南";
		case "recommendation":
			return "对比类问题中竞品占优——补对比与筛选标准类内容";
		case "citation_quality":
			return "引用落点分散——把权威证据集中到可被引用的结构化页面";
		case "coverage":
			return "多数追踪问题从未提及品牌——扩充覆盖缺口对应的内容";
		case "sentiment":
			return "处理事实库中的 ⚠️ 条目：纠错信源 + 与客户确认";
		case "foundation":
			return "按 agentready 清单修官网抓取地基";
		default:
			return "";
	}
}

/** Render the markdown report written back to the bundle. */
export function renderDiagnosisReport(
	d: Diagnosis,
	opts: { brandName: string; generatedAt: string; runsTotal: number },
): string {
	return [
		"---",
		"type: Report",
		"title: 六维诊断",
		`description: ${opts.brandName} 六维诊断分（指标宪章两层模型中的诊断分，实验性权重）`,
		"status: stable",
		`generated: { by: opengeo-platform/diagnosis, at: "${opts.generatedAt}" }`,
		`verified: { by: machine/diagnosis-job, at: "${opts.generatedAt}" }`,
		"---",
		"",
		`# 六维诊断 · ${opts.generatedAt.slice(0, 10)}`,
		"",
		`**综合 ${d.composite.toFixed(1)} 分 · ${d.grade} 级** （数据基础：${opts.runsTotal} 轮测评）`,
		"",
		"| 维度 | 权重 | 得分 | 口径 | 依据 |",
		"| --- | --- | --- | --- | --- |",
		...d.dimensions.map(
			(x) => `| ${x.label} | ${x.weight} | ${x.score.toFixed(0)} | ${x.method === "measured" ? "实测" : "代理*"} | ${x.evidence} |`,
		),
		"",
		"## 改进清单",
		"",
		...d.actions.map((a) => `- **${a.priority}** ${a.text}`),
		"",
		"*代理口径为实验性近似（宪章要求标注），不得表述为外部验证标准。判决为机器生成，人工不修改本文件。",
		"",
	].join("\n");
}
