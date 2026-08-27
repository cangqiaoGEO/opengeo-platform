import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A module a route imports must export server functions and nothing else.
 *
 * The failure this prevents is quiet and expensive: one plain exported function
 * that touches the database keeps `pg` in the module graph, the bundler ships
 * it to the browser, and every client-side navigation dies on `Buffer is not
 * defined` — the pages still render on first load, so it looks like the links
 * are broken rather than the bundle.
 *
 * Server-only helpers live in modules no route imports (guards.ts,
 * guardrail-store.ts); pure values shared with the client live in src/shared.
 */

const ROUTES_DIR = join(import.meta.dirname, "..", "routes");
const SERVER_DIR = import.meta.dirname;

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

function serverModulesImportedByRoutes(): string[] {
	const imported = new Set<string>();
	for (const file of walk(ROUTES_DIR).filter((f) => f.endsWith(".tsx"))) {
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(/from "@\/server\/([a-z-]+)"/g)) {
			imported.add(match[1]);
		}
	}
	return [...imported].sort();
}

describe("route-imported server modules", () => {
	it("finds the modules the routes actually import", () => {
		expect(serverModulesImportedByRoutes().length).toBeGreaterThan(0);
	});

	it.each(serverModulesImportedByRoutes())("%s.ts exports only server functions", (name) => {
		const source = readFileSync(join(SERVER_DIR, `${name}.ts`), "utf8");
		const exports = [...source.matchAll(/^export (?:const|function|class|async function) (\w+)/gm)];

		for (const [line, symbol] of exports.map((m) => [m[0], m[1]] as const)) {
			const declaration = source.slice(source.indexOf(line));
			const isServerFn = /^export const \w+ = createServerFn\(/.test(declaration);
			expect(isServerFn, `${name}.ts exports "${symbol}", which is not a server function`).toBe(true);
		}
	});
});
