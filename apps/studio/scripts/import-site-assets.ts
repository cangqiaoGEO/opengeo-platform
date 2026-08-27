/**
 * Pull a brand's own site into the asset library: images, videos, and the copy
 * blocks worth reusing.
 *
 * Everything is stored by URL and tagged with the page it came from. Images are
 * not downloaded — the brand already hosts them, and a second copy would go
 * stale the moment they replace one. What matters is that a draft can reach
 * them and a reviewer can see where each came from.
 *
 * Usage: pnpm exec tsx --env-file=.env scripts/import-site-assets.ts <brandId> [maxPages]
 */
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { assets } from "@workspace/studio/schema";
import { eq } from "drizzle-orm";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
const CONCURRENCY = 4;

/** Site chrome repeats on every page; importing it 324 times helps nobody. */
const SKIP_IMAGE_PATTERNS = [/logo/i, /icon/i, /favicon/i, /\.svg($|\?)/i, /placeholder/i, /qrcode/i, /wechat/i];
const MIN_TEXT_LENGTH = 60;
const MAX_TEXT_LENGTH = 1200;

type Found = {
	kind: "image" | "video" | "text";
	category: string;
	title?: string;
	fileUrl?: string;
	mimeType?: string;
	content?: string;
	altText?: string;
	sourceUrl: string;
};

async function fetchText(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
		if (!res.ok) return null;
		return await res.text();
	} catch {
		return null;
	}
}

function absolute(src: string, base: string): string | null {
	try {
		return new URL(src, base).href;
	} catch {
		return null;
	}
}

function stripTags(html: string): string {
	return html
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

/** The page's own path is the most honest category we have without guessing. */
function categoryFor(pageUrl: string): string {
	const path = new URL(pageUrl).pathname;
	if (path === "/") return "home";
	if (path.startsWith("/blog")) return "blog";
	if (path.startsWith("/pid") || path.startsWith("/products")) return "product";
	if (path.startsWith("/faqid")) return "faq";
	if (path.startsWith("/comm")) return path.split("/")[2]?.replace(".htm", "") ?? "company";
	if (path.startsWith("/n") || path.startsWith("/newid")) return "news";
	return "other";
}

function extract(html: string, pageUrl: string): Found[] {
	const found: Found[] = [];
	const category = categoryFor(pageUrl);
	const body = html.replace(/<(script|style|nav|footer)[\s\S]*?<\/\1>/gi, "");

	for (const tag of body.match(/<img[^>]*>/gi) ?? []) {
		const src = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1] ?? tag.match(/\sdata-src=["']([^"']+)["']/i)?.[1];
		if (!src) continue;
		const url = absolute(src, pageUrl);
		if (!url || SKIP_IMAGE_PATTERNS.some((p) => p.test(url))) continue;
		const alt = tag.match(/\salt=["']([^"']*)["']/i)?.[1];
		const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
		found.push({
			kind: "image",
			category,
			fileUrl: url,
			mimeType: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
			altText: alt || undefined,
			title: alt || undefined,
			sourceUrl: pageUrl,
		});
	}

	for (const tag of body.match(/<(?:video|source|iframe)[^>]*>/gi) ?? []) {
		const src = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1];
		if (!src) continue;
		const url = absolute(src, pageUrl);
		if (!url) continue;
		const isVideo = /\.(mp4|webm|m3u8)($|\?)/i.test(url) || /youtube|youtu\.be|vimeo|bilibili/i.test(url);
		if (!isVideo) continue;
		found.push({ kind: "video", category, fileUrl: url, mimeType: "video/mp4", sourceUrl: pageUrl });
	}

	// Copy worth reusing is a heading plus what follows it. Loose paragraphs
	// without a heading are usually navigation or boilerplate.
	const sections = body.split(/<h[23][^>]*>/i).slice(1);
	for (const section of sections) {
		const headingEnd = section.search(/<\/h[23]>/i);
		if (headingEnd < 0) continue;
		const heading = stripTags(section.slice(0, headingEnd));
		const rest = section.slice(headingEnd);
		const paragraphs = (rest.match(/<p[^>]*>[\s\S]*?<\/p>/gi) ?? []).map(stripTags).filter((t) => t.length > 20);
		const content = paragraphs.join("\n\n").slice(0, MAX_TEXT_LENGTH);
		if (!heading || content.length < MIN_TEXT_LENGTH) continue;
		found.push({ kind: "text", category, title: heading, content, sourceUrl: pageUrl });
	}

	// FAQ answers carry the specifics buyers ask for; they live in JSON-LD here.
	for (const block of html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? []) {
		const json = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
		try {
			const parsed = JSON.parse(json);
			if (parsed["@type"] !== "FAQPage") continue;
			for (const q of parsed.mainEntity ?? []) {
				const answer = stripTags(q?.acceptedAnswer?.text ?? "");
				if (!q?.name || answer.length < MIN_TEXT_LENGTH) continue;
				found.push({
					kind: "text",
					category: "faq",
					title: q.name,
					content: answer.slice(0, MAX_TEXT_LENGTH),
					sourceUrl: pageUrl,
				});
			}
		} catch {
			// A malformed block is not worth failing the page over.
		}
	}

	return found;
}

async function main() {
	const brandId = process.argv[2];
	if (!brandId) throw new Error("用法：import-site-assets.ts <brandId> [maxPages]");
	const maxPages = Number(process.argv[3] ?? 400);

	const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
	if (!brand) throw new Error(`找不到品牌 ${brandId}`);
	const origin = new URL(brand.website.startsWith("http") ? brand.website : `https://${brand.website}`).origin;

	const sitemap = await fetchText(`${origin}/sitemap.xml`);
	if (!sitemap) throw new Error("拉不到 sitemap.xml");
	const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).slice(0, maxPages);
	console.log(`sitemap 里 ${pages.length} 个页面，开始抓取…`);

	const all: Found[] = [];
	let done = 0;
	async function worker(queue: string[]) {
		for (;;) {
			const page = queue.shift();
			if (!page) return;
			const html = await fetchText(page);
			done++;
			if (done % 25 === 0) console.log(`  ${done}/${pages.length}`);
			if (!html) continue;
			all.push(...extract(html, page));
		}
	}
	const queue = [...pages];
	await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

	// Same photo on forty product pages is one asset, credited to the first page
	// that used it; same for a boilerplate paragraph.
	const seen = new Set<string>();
	const unique = all.filter((a) => {
		const key = a.kind === "text" ? `t:${a.title}|${a.content?.slice(0, 80)}` : `u:${a.fileUrl}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	const rows = unique.map((a) => ({
		organizationId: brand.organizationId,
		brandId: brand.id,
		kind: a.kind,
		category: a.category,
		title: a.title?.slice(0, 300) ?? null,
		fileUrl: a.fileUrl ?? null,
		mimeType: a.mimeType ?? (a.kind === "text" ? "text/plain" : null),
		content: a.content ?? null,
		altText: a.altText ?? null,
		sourceUrl: a.sourceUrl,
		licenseSource: `官网自有 · ${origin}`,
	}));

	let inserted = 0;
	for (let i = 0; i < rows.length; i += 200) {
		const batch = rows.slice(i, i + 200);
		const result = await db.insert(assets).values(batch).onConflictDoNothing().returning({ id: assets.id });
		inserted += result.length;
	}

	const byKind = unique.reduce<Record<string, number>>((acc, a) => {
		acc[a.kind] = (acc[a.kind] ?? 0) + 1;
		return acc;
	}, {});
	console.log(`抓到 ${all.length} 条，去重后 ${unique.length} 条，新入库 ${inserted} 条`);
	console.log("按类型：", byKind);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FAILED:", e?.message ?? e);
		process.exit(1);
	});
