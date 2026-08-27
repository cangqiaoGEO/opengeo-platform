import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { assets } from "@workspace/studio/schema";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireBrand, requireSession } from "./tenant";

/** Assets are referenced by URL, not copied. The brand already hosts them, and
 *  a second copy goes stale the moment they replace one. */

export const listAssets = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			kind: z.enum(["image", "video", "text"]).default("image"),
			category: z.string().optional(),
			limit: z.number().int().min(1).max(200).default(60),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireSession();
		await requireBrand(session.user.id, data.brandId);

		const where = data.category
			? and(eq(assets.brandId, data.brandId), eq(assets.kind, data.kind), eq(assets.category, data.category))
			: and(eq(assets.brandId, data.brandId), eq(assets.kind, data.kind));

		const rows = await db.select().from(assets).where(where).orderBy(desc(assets.createdAt)).limit(data.limit);

		const facets = await db
			.select({ kind: assets.kind, category: assets.category, value: count() })
			.from(assets)
			.where(eq(assets.brandId, data.brandId))
			.groupBy(assets.kind, assets.category);

		const [totals] = await db
			.select({
				images: sql<number>`count(*) filter (where ${assets.kind} = 'image')`,
				videos: sql<number>`count(*) filter (where ${assets.kind} = 'video')`,
				texts: sql<number>`count(*) filter (where ${assets.kind} = 'text')`,
				missingAlt: sql<number>`count(*) filter (where ${assets.kind} = 'image' and ${assets.altText} is null)`,
			})
			.from(assets)
			.where(eq(assets.brandId, data.brandId));

		return { rows, facets, totals };
	});

export const updateAssetAlt = createServerFn({ method: "POST" })
	.validator(z.object({ assetId: z.string().uuid(), altText: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const [row] = await db.select().from(assets).where(eq(assets.id, data.assetId));
		if (!row) return;
		await requireBrand(session.user.id, row.brandId);
		await db
			.update(assets)
			.set({ altText: data.altText || null })
			.where(eq(assets.id, data.assetId));
	});

export const deleteAsset = createServerFn({ method: "POST" })
	.validator(z.object({ assetId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		const [row] = await db.select().from(assets).where(eq(assets.id, data.assetId));
		if (!row) return;
		await requireBrand(session.user.id, row.brandId);
		await db.delete(assets).where(eq(assets.id, data.assetId));
	});
