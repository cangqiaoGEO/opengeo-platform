import { defineConfig } from "drizzle-kit";

/**
 * Studio owns its schema and its migration numbering. Keeping them out of
 * packages/lib is what lets this app live in the fork without ever touching a
 * file the upstream also edits — see "Studio boundary" in AGENTS.md.
 */
export default defineConfig({
	schema: ["./src/schema.ts"],
	out: "./src/migrations",
	// Its own journal table too — sharing the platform's would interleave two
	// independent migration chains in one history.
	migrations: { table: "__drizzle_migrations_studio", schema: "drizzle" },
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
});
