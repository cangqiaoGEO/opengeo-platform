/** Pure guardrail vocabulary, safe on both sides of the wire. */

export const DEFAULTS = {
	requireReview: true,
	blockAdLawTerms: true,
	factBinding: "strict" as const,
	enableTrafficClone: false,
};

export function isRelaxed(s: {
	requireReview: boolean;
	blockAdLawTerms: boolean;
	factBinding: string;
	enableTrafficClone: boolean;
}): string[] {
	const relaxed: string[] = [];
	if (!s.requireReview) relaxed.push("发布前不再强制人工审核");
	if (!s.blockAdLawTerms) relaxed.push("绝对化用语不再拦截");
	if (s.factBinding === "warn") relaxed.push("无据说法只提示不拦截");
	if (s.factBinding === "off") relaxed.push("事实绑定已关闭");
	if (s.enableTrafficClone) relaxed.push("流量复刻已开启");
	return relaxed;
}
