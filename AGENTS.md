@CLAUDE.md

## Cursor Cloud specific instructions

Toolchain: pnpm `10.27.0` (pinned via `packageManager`) and Node 22. `packages/dqa-server` wants Node `>=22.18.0`; the pod's Node 22.14 works but prints a harmless "Unsupported engine" warning on every pnpm command — ignore it (dqa-server is a dev/QA-only tool, not needed for app dev).

Dependency install: `pnpm install --frozen-lockfile` (the startup update script). The root `prepare` step (`lefthook install`) always fails in Cursor Cloud with `core.hooksPath is set locally to '.../.cursor/agent-hooks/...'` — this is expected because Cursor manages git hooks, and all dependencies + native build scripts finish before it. The failure does not affect the installed dependencies; do not try to unset `core.hooksPath` (it would break Cursor's own hooks).

Services / ports (all run in dev mode via pnpm; see each `package.json` for scripts):
- manager (`apps/manager`, ENS App V4, TanStack Start SSR): `pnpm --filter manager dev` → http://localhost:3000
- portal (`apps/portal`, ENS Explorer SPA): `pnpm --filter portal dev` → http://localhost:3001
- api-worker (`workers/api-worker`, Cloudflare/Hono backend): `pnpm --filter api-worker dev` → http://localhost:2999 (manager proxies `/api` here; `/` returns 404 by design). Copy `apps/manager/.env.example`→`.env` and `apps/portal/.env.example`→`.env` before running (both apps run fine with the example defaults).

What needs the local Docker stack vs not:
- The portal explorer works out of the box against the public indexer `https://graphql.ens.dev` (Sepolia data) — no Docker needed. A good smoke test: open http://localhost:3001, search `nick.eth`, view its profile/records.
- Full manager on-chain flows (register/renew/records/migration) need the E2E Docker stack: `pnpm e2e:infra:up` (Anvil Sepolia fork + Alto bundler + paymaster + Rhinestone mockestrator + Panoptes indexer), which requires Docker and network egress. This is optional for general UI dev; the manager landing page loads without it.

Lint / typecheck / test (also see root `package.json` scripts):
- Lint is Biome. CI only lints *changed* packages (`pnpm --filter="...[origin/main]" lint`); running `pnpm check` (biome over the whole repo) surfaces many pre-existing baseline findings that CI never gates on. To lint one app: `pnpm --filter <app> lint`.
- Typecheck uses `tsgo` (not `tsc`): `pnpm typecheck:portal` / `pnpm typecheck:manager` (manager's `pretypecheck` first builds api-worker types).
- Tests use Vitest: `pnpm test:portal`, `pnpm test:manager`. Benign noise in output: happy-dom `AbortError: The operation was aborted` on teardown, and `ECONNREFUSED 127.0.0.1:3000` from tests that attempt network calls with no dev server — tests still pass.
