/**
 * Attribution core (M2, 归因闭环): did a published URL actually get cited by
 * AI engines in runs after it went live? Pure functions — consumed by the
 * attribution server fn, the report script, and tests.
 *
 * 发布不等于生效：只有下一轮真实回答引用了它才算数。
 */

export interface CitationLite {
	url: string;
	model: string;
	createdAt: Date;
}

export interface PublishLite {
	id: string;
	url: string | null;
	channel: string;
	publishedAt: Date;
	draftTitle: string | null;
}

export interface AttributionVerdict {
	recordId: string;
	url: string | null;
	channel: string;
	publishedAt: Date;
	draftTitle: string | null;
	/** runs executed after publish — the denominator of "有没有机会被引" */
	runsAfter: number;
	citedAfter: number;
	citedBefore: number;
	firstCitedAt: Date | null;
	models: string[];
	verdict: "cited" | "not_cited" | "no_runs_yet" | "no_url";
}

/** Same page ⇢ same key: protocol/www/query/hash/trailing-slash insensitive. */
export function normalizeUrl(raw: string): string {
	try {
		const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
		const host = u.hostname.toLowerCase().replace(/^www\./, "");
		const path = u.pathname.replace(/\/+$/, "") || "/";
		return `${host}${path}`;
	} catch {
		return raw.trim().toLowerCase();
	}
}

export function attributeRecord(
	record: PublishLite,
	citations: CitationLite[],
	runsAfter: number,
): AttributionVerdict {
	if (!record.url) {
		return {
			recordId: record.id,
			url: null,
			channel: record.channel,
			publishedAt: record.publishedAt,
			draftTitle: record.draftTitle,
			runsAfter,
			citedAfter: 0,
			citedBefore: 0,
			firstCitedAt: null,
			models: [],
			verdict: "no_url",
		};
	}
	const key = normalizeUrl(record.url);
	const matches = citations.filter((c) => normalizeUrl(c.url) === key);
	const after = matches.filter((c) => c.createdAt >= record.publishedAt);
	const before = matches.filter((c) => c.createdAt < record.publishedAt);
	const firstCitedAt = after.length
		? after.reduce((min, c) => (c.createdAt < min ? c.createdAt : min), after[0].createdAt)
		: null;
	return {
		recordId: record.id,
		url: record.url,
		channel: record.channel,
		publishedAt: record.publishedAt,
		draftTitle: record.draftTitle,
		runsAfter,
		citedAfter: after.length,
		citedBefore: before.length,
		firstCitedAt,
		models: [...new Set(after.map((c) => c.model))].sort(),
		verdict: runsAfter === 0 ? "no_runs_yet" : after.length > 0 ? "cited" : "not_cited",
	};
}

/** Render the markdown report written back to the bundle (Attested Computation). */
export function renderAttributionReport(
	verdicts: AttributionVerdict[],
	opts: { brandName: string; generatedAt: string; runsTotal: number },
): string {
	const label: Record<AttributionVerdict["verdict"], string> = {
		cited: "✅ 被引",
		not_cited: "❌ 未被引",
		no_runs_yet: "⏳ 尚无发布后的测评轮次",
		no_url: "— 无 URL（线下/私域渠道）",
	};
	const lines = [
		"---",
		"type: Report",
		"title: 归因判决",
		`description: ${opts.brandName} 发布内容的引用核对（发布不等于生效，被下一轮真实回答引用才算数）`,
		"status: stable",
		`generated: { by: opengeo-platform/attribution, at: "${opts.generatedAt}" }`,
		`verified: { by: machine/attribution-job, at: "${opts.generatedAt}" }`,
		"---",
		"",
		`# 归因判决 · ${opts.generatedAt.slice(0, 10)}`,
		"",
		`发布记录 ${verdicts.length} 条 · 库内测评 run 共 ${opts.runsTotal} 轮`,
		"",
		"| 发布内容 | 渠道 | 发布时间 | 之后跑了几轮 | 判决 | 发布后被引 | 发布前被引 | 引用引擎 |",
		"| --- | --- | --- | --- | --- | --- | --- | --- |",
		...verdicts.map((v) =>
			[
				v.draftTitle ?? v.url ?? v.recordId.slice(0, 8),
				v.channel,
				v.publishedAt.toISOString().slice(0, 10),
				String(v.runsAfter),
				label[v.verdict],
				String(v.citedAfter),
				String(v.citedBefore),
				v.models.join(" · ") || "—",
			].join(" | ")
				.replace(/^/, "| ")
				.replace(/$/, " |"),
		),
		"",
		"判决为机器生成（Attested Computation），人工不修改本文件；要改变判决，去改内容或事实，跑下一轮。",
		"",
	];
	return lines.join("\n");
}
