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

/** Six-axis radar as inline SVG (hexagon grid, fixed label order). */
function radarSvg(dims: Dimension[]): string {
	const cx = 190;
	const cy = 165;
	const R = 110;
	const angle = (i: number) => (Math.PI * 2 * i) / dims.length - Math.PI / 2;
	const pt = (i: number, r: number) => `${(cx + r * Math.cos(angle(i))).toFixed(1)},${(cy + r * Math.sin(angle(i))).toFixed(1)}`;
	const rings = [0.25, 0.5, 0.75, 1]
		.map((f) => `<polygon points="${dims.map((_, i) => pt(i, R * f)).join(" ")}" fill="none" stroke="#d8d5cc" stroke-width="1"/>`)
		.join("");
	const spokes = dims.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, R).split(",")[0]}" y2="${pt(i, R).split(",")[1]}" stroke="#d8d5cc" stroke-width="1"/>`).join("");
	const shape = `<polygon points="${dims.map((d, i) => pt(i, (R * d.score) / 100)).join(" ")}" fill="rgba(44,74,110,.25)" stroke="#2c4a6e" stroke-width="2"/>`;
	const labels = dims
		.map((d, i) => {
			const [x, y] = pt(i, R + 26).split(",").map(Number);
			return `<text x="${x}" y="${y}" text-anchor="middle" font-size="12" fill="#565b64">${d.label} ${d.score.toFixed(0)}</text>`;
		})
		.join("");
	return `<svg viewBox="0 0 380 330" width="100%" style="max-width:420px" xmlns="http://www.w3.org/2000/svg">${rings}${spokes}${shape}${labels}</svg>`;
}

/** Client-deliverable single-file HTML diagnosis (written next to the markdown report). */
export function renderDiagnosisHtml(
	d: Diagnosis,
	opts: { brandName: string; generatedAt: string; runsTotal: number },
): string {
	const gradeColor: Record<string, string> = { A: "#0b8043", B: "#1a73e8", C: "#f9ab00", D: "#b3261e" };
	const pColor: Record<string, string> = { P0: "#b3261e", P1: "#e8710a", P2: "#0b57d0" };
	const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
	return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.brandName)} 六维诊断</title>
<style>body{font-family:-apple-system,"PingFang SC",sans-serif;background:#f7f6f2;color:#23262b;margin:0;line-height:1.7}
.wrap{max-width:52rem;margin:0 auto;padding:2.5rem 1.2rem}.card{background:#fff;border:1px solid #e3e1da;border-radius:10px;padding:1.2rem 1.4rem;margin:1rem 0}
h1{font-size:1.6rem}table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{text-align:left;padding:.5rem .7rem;border-bottom:1px solid #eee}
.badge{display:inline-block;color:#fff;border-radius:999px;padding:.3rem 1rem;font-weight:700}.svgwrap{display:flex;justify-content:center}
.act{border-left:3px solid #ccc;padding:.5rem .9rem;margin:.5rem 0;background:#fff;border-radius:0 6px 6px 0;font-size:.9rem}
.src{font-size:.75rem;color:#8a8f99}</style>
<div class="wrap">
<h1>${esc(opts.brandName)} · AI 可见度六维诊断</h1>
<p class="src">生成于 ${opts.generatedAt.slice(0, 10)} · 数据基础 ${opts.runsTotal} 轮测评 · OpenGEO 指标宪章口径（实验性权重）</p>
<div class="card" style="text-align:center"><span style="font-size:2.6rem;font-weight:700">${d.composite.toFixed(1)}</span>
<span class="badge" style="background:${gradeColor[d.grade]}">${d.grade} 级</span>
<div class="svgwrap">${radarSvg(d.dimensions)}</div></div>
<div class="card"><table><tr><th>维度</th><th>权重</th><th>得分</th><th>口径</th><th>依据</th></tr>
${d.dimensions.map((x) => `<tr><td>${x.label}</td><td>${x.weight}</td><td><b>${x.score.toFixed(0)}</b></td><td>${x.method === "measured" ? "实测" : "代理*"}</td><td class="src">${esc(x.evidence)}</td></tr>`).join("")}
</table></div>
<div class="card"><b>改进清单</b>
${d.actions.map((a) => `<div class="act" style="border-color:${pColor[a.priority]}"><b style="color:${pColor[a.priority]}">${a.priority}</b> ${esc(a.text)}</div>`).join("")}
</div>
<p class="src">*代理口径为实验性近似（宪章要求标注）。判决为机器生成，人工不修改本文件。OpenGEO · github.com/cangqiaoGEO</p>
</div></html>`;
}
