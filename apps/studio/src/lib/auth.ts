import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createAuth } from "@workspace/lib/auth/server";

/**
 * Studio reads the platform's session rather than keeping its own. Both apps
 * build a better-auth instance over the same `user` / `session` / `organization`
 * tables, and cookies ignore the port, so a session created at :3000 is already
 * valid at :3002 in local development. Deployments that split the two across
 * subdomains need a shared cookie domain — that belongs in the deploy config,
 * not here.
 */
export const auth = createAuth();

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
	return auth.api.getSession({ headers: getRequestHeaders() });
});
