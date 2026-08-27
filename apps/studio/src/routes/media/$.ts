import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { createFileRoute } from "@tanstack/react-router";
import { resolveMediaPath } from "@/server/media-dir";

const CONTENT_TYPES: Record<string, string> = {
	mp4: "video/mp4",
	webm: "video/webm",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
};

/** Serves mirrored media. Files are immutable once written — the mirror stores
 *  a new name rather than overwriting — so they cache hard. */
export const Route = createFileRoute("/media/$")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const stored = (params as { _splat?: string })._splat ?? "";
				const full = resolveMediaPath(stored);
				if (!full) return new Response("Not found", { status: 404 });

				let size: number;
				try {
					size = statSync(full).size;
				} catch {
					return new Response("Not found", { status: 404 });
				}

				const ext = full.split(".").pop()?.toLowerCase() ?? "";
				return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
					headers: {
						"Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
						"Content-Length": String(size),
						"Cache-Control": "public, max-age=31536000, immutable",
					},
				});
			},
		},
	},
});
