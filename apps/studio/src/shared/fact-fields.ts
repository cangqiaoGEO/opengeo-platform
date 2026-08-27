/**
 * The closed vocabulary a fact entry can be filed under, with its labels.
 * Closed rather than free text because generation cites entries by field, and a
 * vocabulary that drifts makes two libraries impossible to compare.
 */

export const FACT_FIELDS = [
	"product_service",
	"product_feature",
	"brand_story",
	"user_pain",
	"trust_credential",
	"customer_case",
	"capacity",
	"certification",
	"lead_time",
	"pricing_basis",
	"other",
] as const;

export type FactField = (typeof FACT_FIELDS)[number];

export const FACT_FIELD_LABELS: Record<FactField, string> = {
	product_service: "产品与服务",
	product_feature: "产品特点",
	brand_story: "品牌故事",
	user_pain: "用户痛点",
	trust_credential: "信任背书",
	customer_case: "客户案例",
	capacity: "产能",
	certification: "认证",
	lead_time: "交期",
	pricing_basis: "价格构成",
	other: "其他",
};
