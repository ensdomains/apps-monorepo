# ENS Apps Monorepo

pnpm monorepo: apps in `apps/`, shared code in `packages/` (used by every app), workers in `workers/`.

## Commands (run from the app or package directory)
- Typecheck: `pnpm typecheck`. Never `npx tsc`, `pnpx tsc`, `pnpm exec tsc`, or `node_modules/.bin/tsc`.
- Tests: `pnpm exec vitest run --maxWorkers=4 <paths>`. Only the files your change affects; never the full suite.
- Changed `packages/`? Also typecheck what changed since `origin/main`, and its dependents: `pnpm --filter "...[origin/main]" --filter "!{.}" typecheck`. The root package has no `typecheck` script; the `!{.}` filter is what CI uses.

## Where logic goes (the rule most often missed)
- Business logic is a pure function: plain inputs in, a value or `Result` out. No React, IO, globals, storage or clock.
- Components render and forward events. Hooks only wire framework APIs (wagmi, TanStack Query, XState, DOM) to those functions.
- Services, actors and handlers: read, call the pure function, write. Pass clients in as parameters.
- If a test needs `vi.mock` to reach a decision, extract the decision into a pure function and test it directly.
- Touching logic tangled with IO: extract only the part you change. Don't restructure in a fix or feature PR.

## Must
No `any` (use `unknown`), no `!`, no mutation, `bigint` for on-chain values, no `Result` mixed with try/catch or unwrapped by throwing, no `useEffect` for fetching or chaining transactions, no viem clients in components.

## Regressions
- Existing tests are the spec. If one fails, fix the code. Change an assertion only when the task changes that behaviour, and list it in the PR.
- Never get green by skipping, loosening or deleting tests, raising timeouts, or adding `biome-ignore`, `@ts-expect-error`, `as unknown as` or `!`.
- A bug fix starts with a test that fails on the unfixed code.
- Before changing an export, default, query key, error shape or global CSS, `git grep -n <name>` every caller. Add an option instead of changing a default.
- Read `git blame` before removing a guard, fallback or odd branch. Keep invariant comments or explain in the PR.
- Keep the diff to the task: no drive-by refactors, renames, moves or reformatting. Report other bugs instead of fixing them.

## More context, load when relevant
- Style rules: `STYLEGUIDE.md` (long; open only the section you need). Logic and hooks: Core Principles, Business Logic Extraction. Growing module: Managing Growing Complexity. Components: React Patterns, Component Composition. Errors: Error Handling with neverthrow. Queries: Data Fetching with TanStack Query. Transactions: State Management, Web3 & Blockchain Patterns. Styling: Styling with Tailwind CSS, Accessibility. Tests: Testing Strategy.
- Writing or editing tests: skill `writing-tests`.
- Opening a PR or working from a Linear ticket: skill `pr-workflow` (branch name, app scope, PR body sections).
- `packages/transaction-manager/`: read its `AGENTS.md` first. Codex and pi do not load that nested file when the session started here.
- Registration intent fails simulation: skill `debug-hca-intent`.
- Registration or renewal pricing: `apps/manager/src/features/register-v2/workflow/pricing/BEHAVIOUR.md` and `apps/manager/src/features/renew/workflow/pricing/BEHAVIOUR.md`.
