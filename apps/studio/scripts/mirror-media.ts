/**
 * Mirror self-hosted media into local storage.
 *
 * Images are left remote on purpose: publishing references them, and a local
 * copy only goes stale. Video is different — every channel that matters wants a
 * file uploaded, not a link — so a video that exists only as a URL is not yet a
 * usable asset.
 *
 * Embeds (YouTube, Vimeo, Bilibili) are skipped rather than scraped. Pulling a
 * stream off a player page violates those platforms' terms and yields a
 * re-encode; the right source for a brand's own video is the original file from
 * the brand.
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/mirror-media.ts <brandId> [--images]
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@workspace/lib/db/db";
import { assets } from "@workspace/studio/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { mediaDir } from "../src/server/media-dir";

const EMBED_HOSTS = /(youtube\.com|youtu\.be|vimeo\.com|bilibili\.com)/i;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";

function storedName(url: string): string {
	const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
	const ext =
		url
			.split("?")[0]
			.split(".")
			.pop()
			?.toLowerCase()
			.replace(/[^a-z0-9]/g, "") ?? "bin";
	return `${hash}.${ext.length <= 5 ? ext : "bin"}`;
}

async function main() {
	const brandId = process.argv[2];
	if (!brandId) throw new Error("用法：mirror-media.ts <brandId> [--images]");
	const kinds = process.argv.includes("--images") ? (["video", "image"] as const) : (["video"] as const);

	const rows = await db
		.select()
		.from(assets)
		.where(and(eq(assets.brandId, brandId), inArray(assets.kind, [...kinds]), isNull(assets.localPath)));

	const root = mediaDir();
	mkdirSync(join(root, brandId), { recursive: true });

	let mirrored = 0;
	let skipped = 0;
	let failed = 0;

	for (const row of rows) {
		if (!row.fileUrl || EMBED_HOSTS.test(row.fileUrl)) {
			skipped++;
			continue;
		}
		try {
			const res = await fetch(row.fileUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120_000) });
			if (!res.ok) {
				failed++;
				continue;
			}
			const buffer = Buffer.from(await res.arrayBuffer());
			const relative = join(brandId, storedName(row.fileUrl));
			writeFileSync(join(root, relative), buffer);
			await db.update(assets).set({ localPath: relative, sizeBytes: buffer.byteLength }).where(eq(assets.id, row.id));
			mirrored++;
			console.log(`  ✓ ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB  ${row.fileUrl}`);
		} catch (e) {
			failed++;
			console.warn(`  ✗ ${row.fileUrl}: ${e instanceof Error ? e.message : e}`);
		}
	}

	console.log(`落盘 ${mirrored} 个，跳过 ${skipped} 个（嵌入式播放器，须向客户索取原片），失败 ${failed} 个`);
	console.log(`存储目录：${root}`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FAILED:", e?.message ?? e);
		process.exit(1);
	});
