# AGENTS.md

## What this is

Elmo is an open-source AI visibility platform (Answer Engine Optimization): it tracks how AI answer engines like ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews mention, cite, and describe brands. It is a **pnpm + Turborepo monorepo** on **Node.js 24** (enforced via `engines`), **TypeScript**, and **PostgreSQL**.

- `apps/web` — product dashboard (TanStack Start + Vite, port 3000)
- `apps/worker` — pg-boss background jobs (AI evaluations, citation tracking, reports)
- `apps/www` — marketing site, docs, and blog (port 3001)
- `apps/cli` — `@elmohq/cli`, the Docker Compose deployment CLI
- `packages/lib` — shared logic and the Drizzle schema/migrations
- `packages/ui` — shared shadcn-based UI components
- `packages/docs` — user-facing docs content (MDX), rendered by `apps/www`
- `packages/deployment` — deployment-mode config (reads `DEPLOYMENT_MODE`, exposes per-mode features)
- `packages/config` — env validation and shared constants/types
- `packages/api-spec` — OpenAPI spec
- `e2e/` — Playwright end-to-end tests

Full setup instructions are in the developer guide at `packages/docs/content/docs/developer-guide/`.

## Commands

- `pnpm dev` — all dev servers (turbo)
- `pnpm test` — Vitest unit tests
- `pnpm build` — build all packages
- `pnpm format` — Biome format
- Migrations: from `packages/lib`, `pnpm exec drizzle-kit migrate` (NEVER RUN THESE UNLESS EXPLICITLY INSTRUCTED BY THE USER)
- E2E tests need Playwright browsers (`pnpm exec playwright install`) and a running app; they are separate from unit tests
- shadcn components: always install with the CLI (`pnpm dlx shadcn@latest add <component>`, from `packages/ui` or `apps/www` — each has its own `components.json`) — never hand-create them

Do not routinely run formatting, linting, type checks, or tests after making changes; CI provides the default validation and these commands should not be part of every agent interaction. Run a targeted command only when it is strictly necessary to diagnose or iterate on the current work, or when the user explicitly requests it. Never run `pnpm lint` or the full test suite by default.

## Tests

- Add tests for the purpose and externally observable behavior of the code, not its implementation shape. Do not test that internal helpers, component structure, configuration objects, or incidental markup have a particular form unless that form is itself a supported contract.
- Prefer tests that exercise a user outcome, public API, business rule, failure mode, or regression. A refactor that preserves behavior should not require test changes.

## Module boundaries

自 2026-08-28 起本仓**自主演进**，不再跟随 elmo 上游（历史 fork 存档于
`opengeo-platform-elmo-fork-archive`）。原先为 cherry-pick 服务的"纯增"红线随之解除：
`apps/web`、`packages/lib`、根 `turbo.json` 都可以修改。保留下来的是模块纪律，不是禁令：

- Studio（`apps/studio` / `packages/studio`）与监测台（`apps/web`）仍是两个产品面，跨界改动要说明理由。
- Studio 保有自己的 schema 与迁移链（`packages/studio/drizzle.studio.config.ts`，journal 表
  `__drizzle_migrations_studio`），与 `packages/lib` 的迁移编号互不进入——这是好的隔离，与 fork 无关，保留。
- 共享组件放 `packages/ui`，产品特有组件放各自 app；env 归 `packages/config/src/env-registry.ts` 统一注册（现在可以加了）。
- `apps/studio/src/styles.css` 里复制的主题 token 可以逐步改回直接引用平台 token。

## Package management and supply-chain security

- **Always use pnpm.** Never install or run dependencies with npm, yarn, or `npx` — that sidesteps the workspace's protections.
- This repo enforces [pnpm supply-chain security](https://pnpm.io/supply-chain-security) via `pnpm-workspace.yaml`: `minimumReleaseAge` (a multi-day cooldown on new releases), `trustPolicy: no-downgrade`, `blockExoticSubdeps`, and an `allowBuilds` allowlist for install scripts.
- **Never weaken or bypass these controls**: don't add `minimumReleaseAgeExclude` entries, don't flip packages to `true` in `allowBuilds`, don't suppress `pnpm audit` advisories, and don't remove `overrides` (many are scoped security patches or dedup anchors). If an install fails because of these controls, that is the system working — report it instead of working around it.

## Environment

`.env` must exist at **both** the repo root and `apps/web/.env` (Vite reads its project root; the worker reads `apps/web/.env` via `--env-file`). Minimum for local mode: `DATABASE_URL`, `DEPLOYMENT_MODE=local`, `VITE_DEPLOYMENT_MODE=local`, `BETTER_AUTH_SECRET`, `ELMO_ENCRYPTION_KEY` (`openssl rand -base64 32`), `APP_URL`/`VITE_APP_URL`, `DISABLE_TELEMETRY=1`. Env validation also requires `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATAFORSEO_LOGIN`, and `DATAFORSEO_PASSWORD` — placeholder values work for UI-only work.

## Git workflow

- Work happens in PRs against `main`.
- Commit as you go: small, atomic commits that show real progress. Don't rewrite history (amend, rebase, force-push) to make it look tidy afterward.
- Commit subjects are plain imperative sentences — no conventional-commit prefixes. Write `paginate top cited domains`, not `feat(web): paginate top cited domains`.
- Don't bump package versions; releases go through Changesets.

## Comments and docs

- Comment only to explain **why** or to add context the code can't show. Never restate what the code already says.
- The same applies to docs and this file: never write down what's already derivable from the repo (what a file imports, what a script runs, how code is structured).
- Don't describe prior behavior ("previously this did X") and don't reference GitHub issues or tickets in code — that context belongs in the commit message or PR.

## Changesets

- Add one only for **user-facing** changes (something an end user of the product would notice). Internal refactors, dependency bumps, and CI tweaks don't get one.
- Keep it to one short, product-focused sentence; default to `patch`; scope it to the packages actually affected.
- If a non-package directory (like `e2e/`) breaks Changesets tooling, fix the tooling configuration rather than inventing versions.

## OpenGEO 研发流程（2026-08-29 起）

按 [OpenGEO/docs/ai-native-sdlc.md](https://github.com/cangqiaoGEO/OpenGEO/blob/main/docs/ai-native-sdlc.md) 执行：任务先写 intent；指标口径与 IF 接口变更走 opengeo-spec RFC；stable 事实与口径变更是 L2（Owner 深审）；生产部署是 L3，放行人=统筹/维护者。双引擎归因（IF-D，RFC-0007）：以 content_ref 联表 matrix 发布记录与 GEO 观测。修 bug 先写会失败的测试，不改测试迁就实现（.claude/hooks 已设门禁）。
