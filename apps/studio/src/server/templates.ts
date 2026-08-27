import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { instructionTemplates } from "@workspace/studio/schema";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { DEFAULT_ARTICLE_INSTRUCTION, DEFAULT_TITLE_INSTRUCTION } from "./default-instructions";
import { requireBrand, requireSession } from "./guards";

/**
 * Title and article instructions are separate records on purpose. A batch
 * written from one combined template reads like the same article thirty times;
 * rotating a pool of each is what gives a batch variety without a human writing
 * thirty briefs.
 */

export const listTemplates = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		await requireBrand(session.user.id, data.brandId);
		return db
			.select()
			.from(instructionTemplates)
			.where(eq(instructionTemplates.brandId, data.brandId))
			.orderBy(asc(instructionTemplates.kind), asc(instructionTemplates.createdAt));
	});

export const createTemplate = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			kind: z.enum(["title", "article"]),
			name: z.string().min(1),
			body: z.string().min(1),
			channel: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireSession();
		const brand = await requireBrand(session.user.id, data.brandId);
		const [row] = await db
			.insert(instructionTemplates)
			.values({
				organizationId: brand.organizationId,
				brandId: brand.id,
				kind: data.kind,
				name: data.name,
				body: data.body,
				channel: data.channel || null,
			})
			.returning();
		return row;
	});

/** Seed the two defaults so a new brand can generate before writing any brief. */
export const seedDefaultTemplates = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const brand = await requireBrand(session.user.id, data.brandId);
		await db.insert(instructionTemplates).values([
			{
				organizationId: brand.organizationId,
				brandId: brand.id,
				kind: "article",
				name: "默认文章指令（八段式）",
				body: DEFAULT_ARTICLE_INSTRUCTION,
			},
			{
				organizationId: brand.organizationId,
				brandId: brand.id,
				kind: "title",
				name: "默认标题指令",
				body: DEFAULT_TITLE_INSTRUCTION,
			},
		]);
	});

export const setTemplateEnabled = createServerFn({ method: "POST" })
	.validator(z.object({ templateId: z.string().uuid(), enabled: z.boolean() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const [row] = await db.select().from(instructionTemplates).where(eq(instructionTemplates.id, data.templateId));
		if (!row) return;
		await requireBrand(session.user.id, row.brandId);
		await db
			.update(instructionTemplates)
			.set({ enabled: data.enabled })
			.where(eq(instructionTemplates.id, data.templateId));
	});

export const deleteTemplate = createServerFn({ method: "POST" })
	.validator(z.object({ templateId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const [row] = await db.select().from(instructionTemplates).where(eq(instructionTemplates.id, data.templateId));
		if (!row) return;
		await requireBrand(session.user.id, row.brandId);
		await db.delete(instructionTemplates).where(and(eq(instructionTemplates.id, data.templateId)));
	});
