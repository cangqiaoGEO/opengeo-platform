/**
 * 控制台分析管线：ObservationRecord[] + 品牌/竞对配置 → 可见度、SoV、引用画像。
 * 指标实现：SoV 来自 RFC-0006（vendored sov_metrics），提及判定来自 collectors，
 * 引用分类来自 citation_utils。聚合遵守 RFC-0005：不跨采集通道混算。
 */

import { annotateObservation } from "../../collectors/src/mentions.mjs";
import { validateRecord } from "../../collectors/src/record.mjs";
import { summarizeCitations } from "./citation_utils.mjs";
import { buildSovSection } from "./sov_metrics.mjs";

/** 单引擎可见度：提及率（出现观测数 / 总观测数，0-100）。 */
function engineVisibility(rows) {
	if (!rows.length) return null;
	return Math.round((rows.filter((r) => r.brand_mentioned).length / rows.length) * 100);
}

export function analyze({ brand, competitors = [], observations = [] }) {
	if (!brand?.name) throw new Error("brand.name 必填");
	const invalid = [];
	const valid = [];
	observations.forEach((o, i) => {
		const errors = validateRecord(o);
		if (errors.length) invalid.push({ index: i, errors });
		else valid.push(o);
	});

	const rows = valid.map((o, i) => ({ ...annotateObservation(o, brand, competitors), surface: valid[i].surface ?? null }));

	// 按引擎聚合（引擎内等权），再对引擎等权 —— 对齐 geo-metrics v2 聚合语义
	const engines = {};
	for (const row of rows) {
		(engines[row.engine] ??= []).push(row);
	}
	const perEngine = Object.entries(engines).map(([engine, engineRows]) => ({
		engine,
		observations: engineRows.length,
		visibility: engineVisibility(engineRows),
		by_access: Object.fromEntries(
			["scraped", "api"].map((a) => {
				const sub = engineRows.filter((r) => r.access === a);
				return [a, sub.length ? { observations: sub.length, visibility: engineVisibility(sub) } : null];
			}),
		),
		// RFC-0005 §3.1：已标注终端的观测分列，未标注的单独成组，三者不合并
		by_surface: Object.fromEntries(
			["pc", "mobile", "unspecified"].map((sf) => {
				const sub = engineRows.filter((r) => (r.surface ?? "unspecified") === sf);
				return [sf, sub.length ? { observations: sub.length, visibility: engineVisibility(sub) } : null];
			}),
		),
	}));
	const visibilities = perEngine.map((e) => e.visibility).filter((v) => v !== null);
	const overallVisibility = visibilities.length
		? Math.round(visibilities.reduce((s, v) => s + v, 0) / visibilities.length)
		: null;

	// SoV 分通道计算（RFC-0005 §1：不跨通道混算），观测多的通道作为主报告
	const sovByAccess = Object.fromEntries(
		["scraped", "api"].map((a) => [a, buildSovSection(rows.filter((r) => r.access === a), competitors)]),
	);
	const primaryAccess = rows.filter((r) => r.access === "api").length >= rows.filter((r) => r.access === "scraped").length ? "api" : "scraped";

	const citations = summarizeCitations(
		valid.flatMap((o) => o.citations ?? []),
		{ ownDomains: brand.domains ?? [], competitorDomains: competitors.flatMap((c) => c.domains ?? []) },
	);

	const perObservation = valid.map((o, i) => ({
		query_id: o.query_id,
		engine: o.engine,
		access: o.access,
		surface: o.surface ?? null,
		provider: o.provider,
		brand_mentioned: rows[i].brand_mentioned,
		competitors_mentioned: rows[i].competitors_mentioned,
		citations: o.citations ?? [],
		web_queries: o.web_queries ?? [],
		text: o.text,
	}));

	return {
		brand: brand.name,
		observation_count: valid.length,
		invalid_records: invalid,
		overall_visibility: overallVisibility,
		per_engine: perEngine.sort((a, b) => (b.visibility ?? -1) - (a.visibility ?? -1)),
		sov: { primary_access: primaryAccess, ...sovByAccess },
		citations,
		per_observation: perObservation,
	};
}
