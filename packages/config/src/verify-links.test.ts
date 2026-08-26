import { describe, expect, it } from "vitest";
import { KNOWN_MODELS } from "./models";
import { modelsWithVerifyLinks, verifyLinkFor } from "./verify-links";

describe("verify links", () => {
	it("sends the question along when the platform accepts one", () => {
		const link = verifyLinkFor("chatgpt", "企业 AI 培训哪家好？");
		expect(link).toEqual({
			url: "https://chatgpt.com/?q=%E4%BC%81%E4%B8%9A%20AI%20%E5%9F%B9%E8%AE%AD%E5%93%AA%E5%AE%B6%E5%A5%BD%EF%BC%9F",
			platform: "ChatGPT",
			prefillsPrompt: true,
		});
	});

	it("still links to platforms that cannot receive the question, flagged so the UI can say to paste it", () => {
		const link = verifyLinkFor("deepseek", "best widgets");
		expect(link).toMatchObject({ url: "https://chat.deepseek.com/", platform: "DeepSeek", prefillsPrompt: false });
		// A no-prefill builder must not fake a query string.
		expect(link?.url).not.toContain("best");
	});

	it("points Google's two AI surfaces at the right pages", () => {
		expect(verifyLinkFor("google-ai-mode", "q")?.url).toContain("udm=50");
		expect(verifyLinkFor("google-ai-overview", "q")?.url).not.toContain("udm=");
	});

	it("returns null rather than guessing a URL for an unknown model or an empty prompt", () => {
		expect(verifyLinkFor("some-future-engine", "q")).toBeNull();
		expect(verifyLinkFor("chatgpt", "   ")).toBeNull();
	});

	it("escapes prompts that would otherwise break out of the query string", () => {
		const url = verifyLinkFor("perplexity", 'a&b=c "quoted" <tag>')?.url ?? "";
		expect(url.startsWith("https://www.perplexity.ai/search?q=")).toBe(true);
		expect(url.slice("https://www.perplexity.ai/search?q=".length)).not.toMatch(/[&<>"]/);
	});

	it("covers every model the product ships display metadata for", () => {
		const covered = new Set(modelsWithVerifyLinks());
		const uncovered = Object.keys(KNOWN_MODELS).filter((m) => !covered.has(m));
		expect(uncovered).toEqual([]);
	});

	it("builds only absolute https URLs", () => {
		for (const model of modelsWithVerifyLinks()) {
			const link = verifyLinkFor(model, "测试问题 test");
			expect(link, model).not.toBeNull();
			expect(link?.url.startsWith("https://"), `${model}: ${link?.url}`).toBe(true);
			expect(() => new URL(link?.url ?? "")).not.toThrow();
		}
	});
});
