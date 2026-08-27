import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { contentDrafts, draftFactCitations, factEntries, reviewActions } from "@workspace/studio/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrand, requireSession } from "./tenant";

/**
 * Review is the last place a person stands behind what goes out. Every decision
 * is appended to `review_actions` rather than only flipping the draft's status,
 * so "who approved this and when" survives later edits to the draft.
 */

async function requireDraft(userId: string, draftId: string) {
	const [draft] = await db.select().from(contentDrafts).where(eq(contentDrafts.id, draftId));
	if (!draft) throw new Error("草稿不存在");
	await requireBrand(userId, draft.brandId);
	return draft;
}

export const getDraft = createServerFn({ method: "GET" })
	.validator(z.object({ draftId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const draft = await requireDraft(session.user.id, data.draftId);

		const citations = await db
			.select({
				claim: draftFactCitations.claim,
				entryContent: factEntries.content,
				entryField: factEntries.field,
				evidenceUrl: factEntries.evidenceUrl,
				approved: factEntries.approved,
			})
			.from(draftFactCitations)
			.innerJoin(factEntries, eq(factEntries.id, draftFactCitations.factEntryId))
			.where(eq(draftFactCitations.draftId, draft.id));

		const history = await db
			.select()
			.from(reviewActions)
			.where(eq(reviewActions.draftId, draft.id))
			.orderBy(desc(reviewActions.createdAt));

		return { draft, citations, history };
	});

/**
 * Approving a draft that still carries unsupported claims is possible — the org
 * may have relaxed fact binding — but it is recorded as an override so the
 * decision is attributable rather than invisible.
 */
export const reviewDraft = createServerFn({ method: "POST" })
	.validator(
		z.object({
			draftId: z.string().uuid(),
			action: z.enum(["approve", "reject"]),
			note: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireSession();
		const draft = await requireDraft(session.user.id, data.draftId);

		if (data.action === "approve" && draft.status === "needs_facts" && !data.note?.trim()) {
			throw new Error("这篇还有事实库支撑不了的说法，通过它必须写明理由");
		}

		await db
			.update(contentDrafts)
			.set({ status: data.action === "approve" ? "approved" : "rejected" })
			.where(eq(contentDrafts.id, draft.id));

		await db.insert(reviewActions).values({
			draftId: draft.id,
			action: draft.status === "needs_facts" && data.action === "approve" ? "approve_override" : data.action,
			note: data.note?.trim() || null,
			actorUserId: session.user.id,
		});
	});
