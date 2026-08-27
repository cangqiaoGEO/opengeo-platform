import { join, resolve } from "node:path";

/**
 * Where mirrored media lives. Outside the repo by default so a checkout never
 * carries a customer's video files, and overridable because a deployment will
 * want a volume rather than a folder next to the code.
 */
export function mediaDir(): string {
	return resolve(process.env.STUDIO_MEDIA_DIR ?? join(process.cwd(), ".media"));
}

/**
 * Resolve a stored path against the media directory, refusing anything that
 * escapes it. The stored value comes from our own mirror script today, but a
 * path from the database is still input, and the cost of being wrong here is
 * serving arbitrary files off the host.
 */
export function resolveMediaPath(storedPath: string): string | null {
	const root = mediaDir();
	const full = resolve(root, storedPath);
	return full === root || full.startsWith(`${root}/`) ? full : null;
}
