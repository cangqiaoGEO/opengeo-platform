import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { citations } from "@workspace/lib/db/schema";
import { contentDrafts, draftFactCitations, factEntries, publishRecords } from "@workspace/studio/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireBrand, requireSession } from "./tenant";

/**
 * Publishing, and then finding out whether it mattered.
 *
 * The export package is the channel that works everywhere: it needs no
 * credentials and no integration, and for most brands the site is a CMS nobody
 * has an API for. What the record adds is the URL — because the tracking side
 * already stores every URL an engine cited, a published page can be checked
 * against real answers instead of assumed to have worked.
 */

function slugify(title: string): string {
	return (
		title
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 60) || "draft"
	);
}

/** Markdown with front matter, plus the evidence behind every cited claim. A
 *  package that travels without its sources makes the next reviewer start over. */
export const exportDraft = createServerFn({ method: "GET" })
	.validator(z.object({ draftId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const [draft] = await db.select().from(contentDrafts).where(eq(contentDrafts.id, data.draftId));
		if (!draft) throw new Error("草稿不存在");
		await requireBrand(session.user.id, draft.brandId);

		const cited = await db
			.select({
				claim: draftFactCitations.claim,
				content: factEntries.content,
				evidenceUrl: factEntries.evidenceUrl,
			})
			.from(draftFactCitations)
			.innerJoin(factEntries, eq(factEntries.id, draftFactCitations.factEntryId))
			.where(eq(draftFactCitations.draftId, draft.id));

		const frontMatter = [
			"---",
			`title: ${JSON.stringify(draft.title)}`,
			`status: ${draft.status}`,
			`model: ${draft.modelVersion ?? "unknown"}`,
			`generated_at: ${draft.createdAt.toISOString()}`,
			"---",
		].join("\n");

		const evidence = cited.length
			? [
					"",
					"---",
					"",
					"## 事实依据（不随正文发布，供审核与存档）",
					"",
					...cited.map(
						(c) => `- ${c.claim}\n  - 依据：${c.content}${c.evidenceUrl ? `\n  - 出处：${c.evidenceUrl}` : ""}`,
					),
				].join("\n")
			: "";

		const unresolved = draft.unsupportedClaims.length
			? ["", "## 尚无依据的说法（未写入正文）", "", ...draft.unsupportedClaims.map((c) => `- ${c}`)].join("\n")
			: "";

		return {
			filename: `${slugify(draft.title)}.md`,
			markdown: `${frontMatter}\n\n# ${draft.title}\n\n${draft.body}\n${evidence}\n${unresolved}\n`,
		};
	});

export const recordPublish = createServerFn({ method: "POST" })
	.validator(
		z.object({
			draftId: z.string().uuid(),
			channel: z.enum(["export", "website", "wechat_draft"]),
			url: z.string().url().optional().or(z.literal("")),
			note: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireSession();
		const [draft] = await db.select().from(contentDrafts).where(eq(contentDrafts.id, data.draftId));
		if (!draft) throw new Error("草稿不存在");
		await requireBrand(session.user.id, draft.brandId);
		if (draft.status !== "approved" && draft.status !== "published") {
			throw new Error("只有审核通过的稿子可以登记发布");
		}

		await db.insert(publishRecords).values({
			draftId: draft.id,
			brandId: draft.brandId,
			channel: data.channel,
			url: data.url || null,
			note: data.note?.trim() || null,
			publishedBy: session.user.id,
		});

		await db.update(contentDrafts).set({ status: "published" }).where(eq(contentDrafts.id, draft.id));
	});

export const setPublishedUrl = createServerFn({ method: "POST" })
	.validator(z.object({ recordId: z.string().uuid(), url: z.string().url() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const [row] = await db.select().from(publishRecords).where(eq(publishRecords.id, data.recordId));
		if (!row) return;
		await requireBrand(session.user.id, row.brandId);
		await db.update(publishRecords).set({ url: data.url }).where(eq(publishRecords.id, data.recordId));
	});

/**
 * The loop's closing move: match published URLs against the URLs answer engines
 * actually cited. A page nobody cited is not a failed page yet — engines take
 * weeks to pick things up — but it is the only honest way to say whether
 * publishing changed anything.
 */
export const getPublishBoard = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		await requireBrand(session.user.id, data.brandId);

		const approved = await db
			.select({ id: contentDrafts.id, title: contentDrafts.title, status: contentDrafts.status })
			.from(contentDrafts)
			.where(and(eq(contentDrafts.brandId, data.brandId), inArray(contentDrafts.status, ["approved"])))
			.orderBy(desc(contentDrafts.createdAt));

		const records = await db
			.select({
				id: publishRecords.id,
				draftId: publishRecords.draftId,
				channel: publishRecords.channel,
				url: publishRecords.url,
				note: publishRecords.note,
				publishedAt: publishRecords.publishedAt,
				title: contentDrafts.title,
			})
			.from(publishRecords)
			.innerJoin(contentDrafts, eq(contentDrafts.id, publishRecords.draftId))
			.where(eq(publishRecords.brandId, data.brandId))
			.orderBy(desc(publishRecords.publishedAt));

		const urls = records.map((r) => r.url).filter((u): u is string => Boolean(u));
		const citedRows = urls.length
			? await db
					.select({ url: citations.url, model: citations.model })
					.from(citations)
					.where(and(eq(citations.brandId, data.brandId), inArray(citations.url, urls)))
			: [];

		const citedByUrl = new Map<string, string[]>();
		for (const row of citedRows) {
			const list = citedByUrl.get(row.url) ?? [];
			if (row.model && !list.includes(row.model)) list.push(row.model);
			citedByUrl.set(row.url, list);
		}

		return {
			approved,
			records: records.map((r) => ({
				...r,
				citedBy: r.url ? (citedByUrl.get(r.url) ?? []) : [],
			})),
		};
	});
