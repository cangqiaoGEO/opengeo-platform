import { FACT_FIELD_LABELS, FACT_FIELDS, type FactField } from "./fact-fields";

/**
 * OKF bundle serialization for the fact library (opengeo-spec BUNDLE.md, IF-A).
 *
 * The bundle is the single writable source of truth for facts; the database is
 * a read-only runtime copy. One markdown file per fact field, one `## entry`
 * section per fact entry. Entry ids must round-trip exactly — draft citations
 * reference them by uuid.
 */

export interface OkfEntry {
	id: string;
	field: FactField;
	content: string;
	evidenceUrl: string | null;
	validUntil: string | null; // ISO date or null
	approved: boolean;
}

const ENTRY_HEADING = /^## entry ([0-9a-f-]{36})\s*$/;

function frontmatter(field: FactField, entries: OkfEntry[], generatedAt: string): string {
	const anyApproved = entries.some((e) => e.approved);
	const lines = [
		"---",
		"type: FactSet",
		`field: ${field}`,
		`title: ${FACT_FIELD_LABELS[field]}`,
		`description: 品牌事实库「${FACT_FIELD_LABELS[field]}」条目（${entries.length} 条）`,
		`status: ${anyApproved ? "stable" : "draft"}`,
		`generated: { by: opengeo-studio/export-okf, at: "${generatedAt}" }`,
	];
	if (anyApproved) lines.push(`verified: { by: human/studio-review, at: "${generatedAt}" }`);
	lines.push("---", "");
	return lines.join("\n");
}

/** Serialize entries into per-field markdown files plus an index. */
export function serializeFacts(
	entries: OkfEntry[],
	opts: { generatedAt: string; brandName: string },
): Map<string, string> {
	const files = new Map<string, string>();
	const byField = new Map<FactField, OkfEntry[]>();
	for (const field of FACT_FIELDS) byField.set(field, []);
	for (const e of entries) byField.get(e.field)?.push(e);

	const indexLines = [
		"---",
		"type: Index",
		"title: 事实库索引",
		`description: ${opts.brandName} 品牌事实库（由 studio 导出，git 为唯一书写真相）`,
		"status: stable",
		`generated: { by: opengeo-studio/export-okf, at: "${opts.generatedAt}" }`,
		`verified: { by: human/studio-review, at: "${opts.generatedAt}" }`,
		"---",
		"",
		`# ${opts.brandName} 事实库`,
		"",
	];

	for (const field of FACT_FIELDS) {
		const list = byField.get(field) ?? [];
		if (list.length === 0) continue;
		const name = `${field}.md`;
		const body = list
			.map((e) => {
				const meta = [
					`- approved: ${e.approved}`,
					`- evidence: ${e.evidenceUrl ?? "无"}`,
					`- valid_until: ${e.validUntil ?? "无"}`,
				].join("\n");
				return `## entry ${e.id}\n\n${meta}\n\n${e.content.trim()}\n`;
			})
			.join("\n");
		files.set(name, `${frontmatter(field, list, opts.generatedAt)}\n${body}`);
		indexLines.push(`- [${FACT_FIELD_LABELS[field]}](${name})（${list.length} 条）`);
	}
	indexLines.push("");
	files.set("index.md", indexLines.join("\n"));
	return files;
}

/** Parse one per-field markdown file back into entries. */
export function parseFactsFile(content: string): OkfEntry[] {
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
	if (!fmMatch) throw new Error("缺少 frontmatter");
	const fieldMatch = fmMatch[1].match(/^field: (\S+)$/m);
	if (!fieldMatch) return []; // index.md etc.
	const field = fieldMatch[1] as FactField;
	if (!FACT_FIELDS.includes(field)) throw new Error(`未知 field: ${field}`);

	const body = content.slice(fmMatch[0].length);
	const lines = body.split("\n");
	const entries: OkfEntry[] = [];
	let cur: { id: string; meta: Record<string, string>; content: string[] } | null = null;

	const flush = () => {
		if (!cur) return;
		entries.push({
			id: cur.id,
			field,
			content: cur.content.join("\n").trim(),
			evidenceUrl: cur.meta.evidence === "无" ? null : (cur.meta.evidence ?? null),
			validUntil: cur.meta.valid_until === "无" ? null : (cur.meta.valid_until ?? null),
			approved: cur.meta.approved === "true",
		});
		cur = null;
	};

	for (const line of lines) {
		const h = line.match(ENTRY_HEADING);
		if (h) {
			flush();
			cur = { id: h[1], meta: {}, content: [] };
			continue;
		}
		if (!cur) continue;
		const m = line.match(/^- (approved|evidence|valid_until): (.*)$/);
		if (m && cur.content.join("").trim() === "") {
			cur.meta[m[1]] = m[2].trim();
			continue;
		}
		cur.content.push(line);
	}
	flush();
	return entries;
}
