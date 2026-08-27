// VENDORED from opengeo-audit brand-geo-audit/tools/sov_metrics.mjs — 修改请先改源仓再同步此副本。
/**
 * 竞对份额（Share of Voice）计算模块 —— RFC-0006 实现。
 *
 * Ported from elmo (https://github.com/elmohq/elmo)
 * packages/lib/src/report-metrics.ts
 * Copyright (c) 2026 Blue Whale Software, LLC — MIT License.
 * 移植改动：TypeScript→ESM JS；输入行改为 RFC-0005 ObservationRecord 衍生的
 * snake_case 轻量行；补充样本门槛检查（对齐"样本不足只输出缺口"原则）；
 * 强项判定增加 SoV ≥ 50 门槛（上游会把低 SoV 高竞对活跃查询选为强项，
 * 与"强项 = 战胜真实对手"的报告叙事矛盾，见 RFC-0006 §2）。
 *
 * 输入行形态：{ query_id, brand_mentioned: boolean, competitors_mentioned: string[] }
 * 竞对形态：  { name, domain }
 */

/** SoV 数字可信的最低观测数（RFC-0006 §3）。 */
export const MIN_OBSERVATIONS_FOR_SOV = 10;

/** 强项查询的最低 SoV：过半份额才算战胜对手（RFC-0006 §2）。 */
export const STRENGTH_MIN_SOV = 50;

/**
 * 单条查询的 SoV。
 * SoV = 品牌提及数 / (品牌提及数 + 竞对提及总次数)；分母为 0 返回 null。
 */
export function computeQuerySoV(queryId, rows, competitors) {
	const queryRows = rows.filter((r) => r.query_id === queryId);
	const totalRuns = queryRows.length;

	if (totalRuns === 0) {
		return {
			query_id: queryId,
			sov: null,
			brand_mention_count: 0,
			total_runs: 0,
			total_competitor_mentions: 0,
			competitor_mentions: {},
		};
	}

	const brandMentionCount = queryRows.filter((r) => r.brand_mentioned).length;

	const competitorMentions = {};
	let totalCompetitorMentions = 0;
	for (const row of queryRows) {
		if (!row.competitors_mentioned) continue;
		for (const mentioned of row.competitors_mentioned) {
			// 只统计冻结竞对清单内的品牌（RFC-0006 §1）
			if (competitors.some((c) => c.name === mentioned)) {
				competitorMentions[mentioned] = (competitorMentions[mentioned] || 0) + 1;
				totalCompetitorMentions++;
			}
		}
	}

	const denominator = brandMentionCount + totalCompetitorMentions;
	const sov = denominator === 0 ? null : Math.round((brandMentionCount / denominator) * 100);

	return {
		query_id: queryId,
		sov,
		brand_mention_count: brandMentionCount,
		total_runs: totalRuns,
		total_competitor_mentions: totalCompetitorMentions,
		competitor_mentions: competitorMentions,
	};
}

/** 全部观测聚合的总体 SoV；无人被提及返回 null。 */
export function computeOverallSoV(rows, competitors) {
	let totalBrandMentions = 0;
	let totalCompetitorMentions = 0;

	for (const row of rows) {
		if (row.brand_mentioned) totalBrandMentions++;
		if (!row.competitors_mentioned) continue;
		for (const mentioned of row.competitors_mentioned) {
			if (competitors.some((c) => c.name === mentioned)) totalCompetitorMentions++;
		}
	}

	const denominator = totalBrandMentions + totalCompetitorMentions;
	if (denominator === 0) return null;
	return Math.round((totalBrandMentions / denominator) * 100);
}

/** 分竞对 SoV，降序；无任何提及返回空数组。 */
export function computeCompetitorSoVs(rows, competitors) {
	let totalBrandMentions = 0;
	const competitorMentionCounts = {};

	for (const row of rows) {
		if (row.brand_mentioned) totalBrandMentions++;
		if (!row.competitors_mentioned) continue;
		for (const mentioned of row.competitors_mentioned) {
			if (competitors.some((c) => c.name === mentioned)) {
				competitorMentionCounts[mentioned] = (competitorMentionCounts[mentioned] || 0) + 1;
			}
		}
	}

	const totalAllMentions =
		totalBrandMentions + Object.values(competitorMentionCounts).reduce((sum, c) => sum + c, 0);
	if (totalAllMentions === 0) return [];

	return competitors
		.map((comp) => {
			const mentionCount = competitorMentionCounts[comp.name] || 0;
			return {
				name: comp.name,
				sov: Math.round((mentionCount / totalAllMentions) * 100),
				mention_count: mentionCount,
			};
		})
		.sort((a, b) => b.sov - a.sov);
}

/**
 * 强项 / 机会查询选取（RFC-0006 §2）：至多 2 强项 + 2 机会。
 * 强项优先选竞对活跃的高 SoV 查询；机会优先非零 SoV，零 SoV 至多 1 条。
 */
export function selectRepresentativeQueries(querySoVs) {
	const strengths = querySoVs
		.filter((q) => q.sov !== null && q.sov >= STRENGTH_MIN_SOV)
		.sort((a, b) => {
			const aHasComp = a.total_competitor_mentions > 0 ? 1 : 0;
			const bHasComp = b.total_competitor_mentions > 0 ? 1 : 0;
			if (bHasComp !== aHasComp) return bHasComp - aHasComp;
			return (b.sov ?? 0) - (a.sov ?? 0);
		});

	const nonZeroOpportunities = querySoVs
		.filter((q) => q.total_competitor_mentions > 0 && q.sov !== null && q.sov > 0)
		.sort((a, b) => {
			const sovDiff = (a.sov ?? 0) - (b.sov ?? 0);
			if (sovDiff !== 0) return sovDiff;
			return b.total_competitor_mentions - a.total_competitor_mentions;
		});

	const zeroSovOpportunities = querySoVs
		.filter((q) => q.total_competitor_mentions > 0 && (q.sov === null || q.sov === 0))
		.sort((a, b) => b.total_competitor_mentions - a.total_competitor_mentions);

	const selected = [];
	const usedIds = new Set();
	const push = (q, category) => {
		if (usedIds.has(q.query_id)) return;
		usedIds.add(q.query_id);
		selected.push({ query_id: q.query_id, category, sov: q.sov });
	};

	for (const s of strengths) {
		if (selected.filter((x) => x.category === "strength").length >= 2) break;
		push(s, "strength");
	}
	for (const o of nonZeroOpportunities) {
		if (selected.filter((x) => x.category === "opportunity").length >= 2) break;
		push(o, "opportunity");
	}
	// 零 SoV 机会至多补 1 条
	if (selected.filter((x) => x.category === "opportunity").length < 2 && zeroSovOpportunities.length > 0) {
		push(zeroSovOpportunities[0], "opportunity");
	}
	return selected;
}

/**
 * 报告入口：样本不足时只输出缺口，不产出数字（RFC-0006 §3）。
 */
export function buildSovSection(rows, competitors) {
	if (competitors.length === 0) {
		return { status: "insufficient", reason: "竞对清单为空：SoV 需要冻结的竞对清单" };
	}
	if (rows.length < MIN_OBSERVATIONS_FOR_SOV) {
		return {
			status: "insufficient",
			reason: `观测数 ${rows.length} < ${MIN_OBSERVATIONS_FOR_SOV}：样本不足，不产出 SoV 数字`,
		};
	}
	const queryIds = [...new Set(rows.map((r) => r.query_id))];
	const perQuery = queryIds.map((id) => computeQuerySoV(id, rows, competitors));
	return {
		status: "measured",
		overall_sov: computeOverallSoV(rows, competitors),
		competitor_sovs: computeCompetitorSoVs(rows, competitors),
		per_query: perQuery,
		representative: selectRepresentativeQueries(perQuery),
	};
}
