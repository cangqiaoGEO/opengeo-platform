import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { computeAttribution } from "./attribution-data";
import { requireBrand, requireSession } from "./guards";

export const getAttribution = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireSession();
		await requireBrand(session.user.id, data.brandId);
		return computeAttribution(data.brandId);
	});
