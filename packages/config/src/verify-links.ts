/**
 * "Verify on the platform" links: given a tracked model and the prompt that was
 * asked, where a person goes to see for themselves what that AI answers today.
 *
 * A visibility number only persuades someone who trusts how it was measured.
 * A link they can click and watch the engine recommend (or ignore) their brand
 * persuades immediately — so every run we display should be one click away from
 * its own re-verification.
 *
 * Two caveats the UI must respect and this module encodes:
 *  - A tracked run is a point-in-time observation. The live answer will differ,
 *    especially on engines that personalize. `prefillsPrompt: false` marks the
 *    engines that cannot even receive the question, where the user must paste it.
 *  - API-channel runs observe a bare model, not the consumer product. The link
 *    still goes to the consumer surface, which is a different thing being
 *    compared — callers should label it as such.
 */

export interface VerifyLink {
	/** Where to send the person. */
	url: string;
	/** Consumer-product name, for the link label. */
	platform: string;
	/** Whether the question arrives pre-filled, or has to be pasted in. */
	prefillsPrompt: boolean;
}

type LinkBuilder = { platform: string; build: (q: string) => string; prefills: boolean };

const enc = encodeURIComponent;

const BUILDERS: Record<string, LinkBuilder> = {
	// —— International ——
	chatgpt: { platform: "ChatGPT", prefills: true, build: (q) => `https://chatgpt.com/?q=${enc(q)}` },
	perplexity: { platform: "Perplexity", prefills: true, build: (q) => `https://www.perplexity.ai/search?q=${enc(q)}` },
	copilot: { platform: "Copilot", prefills: true, build: (q) => `https://copilot.microsoft.com/?q=${enc(q)}` },
	grok: { platform: "Grok", prefills: true, build: (q) => `https://grok.com/?q=${enc(q)}` },
	claude: { platform: "Claude", prefills: true, build: (q) => `https://claude.ai/new?q=${enc(q)}` },
	// udm=50 is Google's AI Mode surface; the plain SERP is where AI Overviews appear.
	"google-ai-mode": { platform: "Google AI Mode", prefills: true, build: (q) => `https://www.google.com/search?q=${enc(q)}&udm=50` },
	"google-ai-overview": { platform: "Google Search", prefills: true, build: (q) => `https://www.google.com/search?q=${enc(q)}` },
	gemini: { platform: "Gemini", prefills: false, build: () => "https://gemini.google.com/app" },
	mistral: { platform: "Le Chat", prefills: true, build: (q) => `https://chat.mistral.ai/chat?q=${enc(q)}` },
	// —— Chinese ——
	doubao: { platform: "豆包", prefills: true, build: (q) => `https://www.doubao.com/chat/?q=${enc(q)}` },
	qwen: { platform: "通义千问", prefills: false, build: () => "https://chat.qwen.ai/" },
	deepseek: { platform: "DeepSeek", prefills: false, build: () => "https://chat.deepseek.com/" },
	yuanbao: { platform: "腾讯元宝", prefills: false, build: () => "https://yuanbao.tencent.com/chat" },
	kimi: { platform: "Kimi", prefills: true, build: (q) => `https://www.kimi.com/?q=${enc(q)}` },
	ernie: { platform: "文心一言", prefills: false, build: () => "https://yiyan.baidu.com/" },
	spark: { platform: "讯飞星火", prefills: false, build: () => "https://xinghuo.xfyun.cn/desk" },
	zhipu: { platform: "智谱清言", prefills: false, build: () => "https://chatglm.cn/main/alltoolsdetail" },
	"baidu-ai": { platform: "百度AI搜索", prefills: true, build: (q) => `https://chat.baidu.com/search?word=${enc(q)}` },
	"quark-ai": { platform: "夸克AI", prefills: true, build: (q) => `https://quark.sm.cn/s?q=${enc(q)}` },
	"nano-ai": { platform: "纳米AI", prefills: true, build: (q) => `https://bot.n.cn/?q=${enc(q)}` },
	"douyin-ai": { platform: "抖音AI搜索", prefills: true, build: (q) => `https://www.douyin.com/search/${enc(q)}` },
};

/**
 * Build the verification link for a run, or null when the model has no consumer
 * surface we can point at (never guess a URL — a dead link costs more trust
 * than a missing button).
 */
export function verifyLinkFor(model: string, prompt: string): VerifyLink | null {
	const builder = BUILDERS[model];
	if (!builder) return null;
	const question = prompt.trim();
	if (!question) return null;
	return { url: builder.build(question), platform: builder.platform, prefillsPrompt: builder.prefills };
}

/** Models that have a verification surface — for coverage tests and settings copy. */
export function modelsWithVerifyLinks(): string[] {
	return Object.keys(BUILDERS);
}
