import { afterEach, describe, expect, it, vi } from "vitest";
import { mediaDir, resolveMediaPath } from "./media-dir";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("media path resolution", () => {
	it("resolves a stored path inside the media directory", () => {
		vi.stubEnv("STUDIO_MEDIA_DIR", "/srv/studio-media");
		expect(resolveMediaPath("brand/abc.mp4")).toBe("/srv/studio-media/brand/abc.mp4");
	});

	it("refuses a path that climbs out of it", () => {
		vi.stubEnv("STUDIO_MEDIA_DIR", "/srv/studio-media");
		expect(resolveMediaPath("../../etc/passwd")).toBeNull();
		expect(resolveMediaPath("brand/../../../etc/passwd")).toBeNull();
	});

	it("refuses an absolute path", () => {
		vi.stubEnv("STUDIO_MEDIA_DIR", "/srv/studio-media");
		expect(resolveMediaPath("/etc/passwd")).toBeNull();
	});

	it("refuses a sibling directory that merely shares the prefix", () => {
		vi.stubEnv("STUDIO_MEDIA_DIR", "/srv/studio-media");
		expect(resolveMediaPath("../studio-media-evil/x.mp4")).toBeNull();
	});

	it("honours the env override", () => {
		vi.stubEnv("STUDIO_MEDIA_DIR", "/mnt/volume");
		expect(mediaDir()).toBe("/mnt/volume");
	});
});
