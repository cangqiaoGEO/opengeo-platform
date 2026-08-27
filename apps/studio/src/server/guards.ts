import { getRequestHeaders } from "@tanstack/react-start/server";
import { db } from "@workspace/lib/db/db";
import { brands, member } from "@workspace/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";

/**
 * Tenancy works exactly as it does in the tracking app: a brand belongs to one
 * organization, and org membership is the access check. Studio resolves it the
 * same way rather than inventing a second model, because both apps read the
 * same `brands` rows and a mismatch would show up as one app leaking what the
 * other hides.
 *
 * These are plain functions that touch the database, so they must never be
 * imported by a route file — only by other server modules. A module that a
 * route imports has to export server functions and nothing else, or the
 * bundler follows the non-server export and ships `pg` to the browser, where
 * every client-side navigation then dies on `Buffer is not defined`.
 */

export class UnauthorizedError extends Error {
	constructor() {
		super("Unauthorized");
	}
}

export async function requireSession() {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (!session) throw new UnauthorizedError();
	return session;
}

export async function listAccessibleBrands(userId: string) {
	const memberships = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(eq(member.userId, userId));
	const orgIds = memberships.map((m) => m.organizationId);
	if (orgIds.length === 0) return [];

	return db
		.select({ id: brands.id, name: brands.name, website: brands.website, organizationId: brands.organizationId })
		.from(brands)
		.where(inArray(brands.organizationId, orgIds));
}

/** Throws unless the caller can reach this brand, and returns it. */
export async function requireBrand(userId: string, brandId: string) {
	const accessible = await listAccessibleBrands(userId);
	const brand = accessible.find((b) => b.id === brandId);
	if (!brand) throw new UnauthorizedError();
	return brand;
}
