import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import {
	contentDrafts,
	contentTasks,
	factBases,
	guardrailSettings,
	instructionTemplates,
} from "@workspace/studio/schema";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { generateDraft } from "./generate";
import { requireBrand, requireSession } from "./tenant";

/**
 * A task is a batch of drafts against a set of tracked prompts. Drafts are
 * produced one call at a time rather than in a background job: generation takes
 * tens of seconds per draft, and a page that shows each one landing is both
 * simpler to operate and easier to stop halfway than a queue you cannot see.
 */

async function resolveGuardrails(organizationId: string) {
	const [row] = await db.select().from(guardrailSettings).where(eq(guardrailSettings.organizationId, organizationId));
	if (row) return row;
	// Absent settings mean nobody has relaxed anything, which is the safe reading.
	return {
		organizationId,
		requireReview: true,
		blockAdLawTerms: true,
		factBinding: "strict" as const,
		enableTrafficClone: false,
		updatedBy: null,
		updatedAt: new Date(),
	};
}

export const getTaskWorkspace = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		await requireBrand(session.user.id, data.brandId);

		const [factBase] = await db.select().from(factBases).where(eq(factBases.brandId, data.brandId));
		const templates = await db
			.select()
			.from(instructionTemplates)
			.where(and(eq(instructionTemplates.brandId, data.brandId), eq(instructionTemplates.enabled, true)));
		const trackedPrompts = await db
			.select({ id: prompts.id, value: prompts.value, tags: prompts.tags })
			.from(prompts)
			.where(eq(prompts.brandId, data.brandId));
		const tasks = await db
			.select()
			.from(contentTasks)
			.where(eq(contentTasks.brandId, data.brandId))
			.orderBy(desc(contentTasks.createdAt));

		const draftCounts = await db
			.select({ taskId: contentDrafts.taskId, value: count() })
			.from(contentDrafts)
			.groupBy(contentDrafts.taskId);
		const doneByTask = new Map(draftCounts.map((d) => [d.taskId, d.value]));

		return {
			hasFactBase: Boolean(factBase),
			templates,
			prompts: trackedPrompts,
			tasks: tasks.map((t) => ({ ...t, drafted: doneByTask.get(t.id) ?? 0 })),
		};
	});

export const createTask = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			name: z.string().min(1),
			promptIds: z.array(z.string()).min(1),
			draftCount: z.number().int().min(1).max(20),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireSession();
		const brand = await requireBrand(session.user.id, data.brandId);
		const guardrails = await resolveGuardrails(brand.organizationId);

		const [task] = await db
			.insert(contentTasks)
			.values({
				organizationId: brand.organizationId,
				brandId: brand.id,
				name: data.name,
				promptIds: data.promptIds,
				draftCount: data.draftCount,
				// Frozen here, not read at review time: what the rules were when this
				// batch was written is the question an incident actually asks.
				guardrails: {
					requireReview: guardrails.requireReview,
					blockAdLawTerms: guardrails.blockAdLawTerms,
					factBinding: guardrails.factBinding,
					enableTrafficClone: guardrails.enableTrafficClone,
				},
				createdBy: session.user.id,
			})
			.returning();

		return task;
	});

/** Produce the next missing draft for a task. Returns null when the batch is full. */
export const generateNextDraft = createServerFn({ method: "POST" })
	.validator(z.object({ taskId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const [task] = await db.select().from(contentTasks).where(eq(contentTasks.id, data.taskId));
		if (!task) throw new Error("任务不存在");
		await requireBrand(session.user.id, task.brandId);

		const [done] = await db.select({ value: count() }).from(contentDrafts).where(eq(contentDrafts.taskId, task.id));
		const made = done?.value ?? 0;
		if (made >= task.draftCount) return null;

		const [factBase] = await db.select().from(factBases).where(eq(factBases.brandId, task.brandId));
		if (!factBase) throw new Error("这个品牌还没有事实库");

		const templates = await db
			.select()
			.from(instructionTemplates)
			.where(and(eq(instructionTemplates.brandId, task.brandId), eq(instructionTemplates.enabled, true)));
		const articles = templates.filter((t) => t.kind === "article");
		const titles = templates.filter((t) => t.kind === "title");
		if (articles.length === 0 || titles.length === 0) throw new Error("需要至少一条文章指令和一条标题指令");

		const promptRows = await db
			.select({ id: prompts.id, value: prompts.value })
			.from(prompts)
			.where(inArray(prompts.id, task.promptIds));
		if (promptRows.length === 0) throw new Error("任务选中的问题已不存在");

		// Rotate prompts and templates by index so a batch spreads across the
		// selected questions instead of writing the first one N times.
		const promptRow = promptRows[made % promptRows.length];
		const article = articles[made % articles.length];
		const title = titles[made % titles.length];

		return generateDraft({
			taskId: task.id,
			brandId: task.brandId,
			factBaseId: factBase.id,
			promptValue: promptRow.value,
			articleInstruction: article.body,
			titleInstruction: title.body,
			factBinding: task.guardrails.factBinding,
			blockAdLawTerms: task.guardrails.blockAdLawTerms,
		});
	});

export const listDrafts = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		await requireBrand(session.user.id, data.brandId);
		return db
			.select({
				id: contentDrafts.id,
				title: contentDrafts.title,
				body: contentDrafts.body,
				status: contentDrafts.status,
				unsupportedClaims: contentDrafts.unsupportedClaims,
				flaggedTerms: contentDrafts.flaggedTerms,
				modelVersion: contentDrafts.modelVersion,
				createdAt: contentDrafts.createdAt,
			})
			.from(contentDrafts)
			.where(eq(contentDrafts.brandId, data.brandId))
			.orderBy(desc(contentDrafts.createdAt));
	});
