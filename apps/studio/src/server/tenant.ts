import { createServerFn } from "@tanstack/react-start";
import { listAccessibleBrands, requireSession } from "./guards";

/** Route files import from here: every export is a server function, which is
 *  what keeps the database out of the client bundle. */
export const getWorkspace = createServerFn({ method: "GET" }).handler(async () => {
	const session = await requireSession();
	return { user: session.user, brands: await listAccessibleBrands(session.user.id) };
});
