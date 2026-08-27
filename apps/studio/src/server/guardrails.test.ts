import { describe, expect, it } from "vitest";
import { DEFAULTS, isRelaxed } from "@/shared/guardrail-state";

describe("relaxed-state banner", () => {
	it("says nothing while every guardrail is at its safe value", () => {
		expect(isRelaxed(DEFAULTS)).toEqual([]);
	});

	it("names each guardrail that has been turned down", () => {
		expect(isRelaxed({ ...DEFAULTS, requireReview: false })).toEqual(["发布前不再强制人工审核"]);
		expect(isRelaxed({ ...DEFAULTS, blockAdLawTerms: false })).toEqual(["绝对化用语不再拦截"]);
		expect(isRelaxed({ ...DEFAULTS, enableTrafficClone: true })).toEqual(["流量复刻已开启"]);
	});

	it("distinguishes warn from off, because one still tells the reviewer", () => {
		expect(isRelaxed({ ...DEFAULTS, factBinding: "warn" })).toEqual(["无据说法只提示不拦截"]);
		expect(isRelaxed({ ...DEFAULTS, factBinding: "off" })).toEqual(["事实绑定已关闭"]);
	});

	it("lists all of them at once so the banner cannot hide the second one", () => {
		expect(
			isRelaxed({ requireReview: false, blockAdLawTerms: false, factBinding: "off", enableTrafficClone: true }),
		).toHaveLength(4);
	});
});
