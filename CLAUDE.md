# ENS Apps Monorepo - AI Agent Instructions

## Style Guide

**[STYLEGUIDE.md](./STYLEGUIDE.md)** applies to every app, worker and package in
this repo. It is long, so don't work from memory: before writing code, open the
sections for what you are touching (map below) and follow them. Before opening
a PR, check the diff against `.greptile/config.json`; Greptile blocks merge on
its `high` rules.

**Where logic goes (the rule most often missed).** Business logic is a pure
function: plain inputs in, a value or `Result` out, no React, no IO, no reads
of globals, storage or the clock.
- Components render and forward events (Thin React Layer, 🔴 Must).
- Hooks only connect framework APIs (wagmi, TanStack Query, XState, the DOM)
  to those functions. Validation, pricing, encoding and decisions on domain
  data don't live in a hook (Pure Functions Over Custom Hooks).
- Services, actors and handlers keep IO at the edges: read, call the pure
  function, then write. Pass clients and other dependencies in as parameters.
- Unit tests call the pure function directly, without mocks. If a test needs
  `vi.mock` to reach a decision, extract that decision into a pure function.
- When you change logic that is still tangled with IO, extract the part you
  change into a pure function and test it there. Only the part you change:
  the rest waits for its own PR.

**🔴 Must:** no `any` (use `unknown`), no `!`, no mutation, `bigint` for every
on-chain value, never mix `Result` with try/catch or unwrap a `Result` by
throwing, never `useEffect` for data fetching or to chain transactions, never
create viem clients in components.

**🟡 Defaults Greptile checks:** `readonly` inputs and fields (`readonly T[]`
for arrays), `match()` for 3+ branches, one `TaggedError('Name')<{ cause:
unknown }>` per operation, `ResultFn` for multi-step async `Result`s,
`getXxxQueryOptions` factories with object query keys, `is`/`has`/`should`/
`can` booleans, `UPPER_SNAKE_CASE` constants.

**Section map:**

| Touching | Read in STYLEGUIDE.md |
| --- | --- |
| Where logic lives, hooks | Core Principles, Business Logic Extraction |
| Components | React Patterns, Component Composition |
| Errors, `Result` | Error Handling with neverthrow, Advanced neverthrow Patterns |
| Queries | Data Fetching with TanStack Query |
| Transactions, contracts | State Management (multi-step transactions), Web3 & Blockchain Patterns |
| Styling, accessibility | Styling with Tailwind CSS, Accessibility |
| Tests | Testing Strategy |

Inside `packages/transaction-manager/`, also follow its `CLAUDE.md`.

## PR Conventions when working from Linear tickets

This is a monorepo with multiple apps under `apps/`. When working on a ticket,
use the Linear project name to determine which app to work in — the project name
will contain the app folder name (e.g. "manager app v4 beta" → `apps/manager/`).

Only modify files within the relevant app directory unless the change
genuinely requires shared code updates (e.g., packages/).

- Branch naming, if initiated from a linear ticket: `linear/<linear-ticket-id>`
- Keep PRs focused on the ticket scope
- Do NOT include raw ticket descriptions in PR bodies
- Summarize changes made, not the full requirements

## Preventing Regressions

Most bugs here are regressions: a change that is right for its task but
breaks something another flow relied on. These rules apply to every fix
and feature.

**Existing tests are the spec. Don't edit them to make your change pass.**
- If an existing test fails after your change, assume the change is wrong
  and fix the code. The test is doing its job.
- Change an existing assertion only when the task explicitly changes that
  behaviour. Then list each changed or deleted test, with one line of why,
  under "Behaviour changes" in the PR body.
- Never do any of these to get green: delete or `.skip` a test, change an
  expected value to whatever the code now returns, loosen a matcher
  (`toEqual` to `toMatchObject`, a literal to `expect.any`), drop an
  assertion, update a snapshot or fixture without reading its diff, raise
  a timeout, add retries, or mock the code under test.
- The same goes for the other gates: no new `biome-ignore`,
  `@ts-expect-error`, `as unknown as`, or `!` to silence an error your
  change caused.
- Deleting tests together with the code they cover is fine.

**A bug fix starts with a failing test.** Write the test that reproduces
the bug, run it, and watch it fail on the unfixed code. Then fix it. Keep
the test: it stops the bug coming back.

**Find the blast radius before changing shared code.**
- Before changing an exported function, hook, type, default, query key,
  error shape, or global CSS, find every caller (`git grep -n <name>`) and
  check each still gets what it expects. `packages/` is used by every app.
- Don't change a default to suit one caller; add an explicit option and
  leave the other callers alone.
- When you touch `packages/`, run typecheck and the affected tests in every
  app that imports it, not just the one you are working in.

**Understand code before removing it.** A check, early return, fallback,
`!important`, or odd-looking branch usually exists because of a past bug.
Read `git log -L` or `git blame` and the PR that added it first. If a
comment states an invariant ("never", "must", "only"), keep it or say in
the PR body why it no longer holds.

**Keep the diff to the task.** No drive-by refactors, renames, file moves,
or reformatting in a fix or feature PR; each is unreviewed behaviour
change. If you find another bug, mention it in the PR instead of fixing it
in passing.

**Verify before calling it done.**
- Run the tests for the modules you changed and the modules that import
  them, plus `pnpm typecheck` in each affected app.
- For a new or changed test, break the code it covers once and confirm the
  test fails.
- For UI changes, check the screen in the running app at desktop and
  mobile width. Green tests don't prove a working screen.

**Add a "Regression check" section to the PR body:** the callers you
checked, existing tests you changed and why (or "none"), and any behaviour
that changes for users or other callers.

## Type Checking

Run `pnpm typecheck` from the app directory (e.g. `apps/portal/`) to type-check.
Do **not** use `npx tsc`, `pnpx tsc`, or `./node_modules/.bin/tsc` — they resolve to the wrong binary or skip project-level configuration.

## Writing Tests

Every test must be able to fail when real behaviour breaks. Fewer, sharper tests beat many shallow ones. Don't write:

- **Tests of dead code.** If nothing outside tests imports a function, delete the function rather than testing it. Don't export a helper only so a test can reach it; test it through the live entry point.
- **Tests of the mock.** Asserting a value the mock itself returned, or that a mocked child component rendered its props, proves nothing.
- **Tests of libraries or the compiler.** Don't re-test viem, zod/valibot, neverthrow, clsx/tailwind-merge, TanStack, `Intl`/`Date`, or properties TypeScript already enforces (shapes, `typeof`, type-level `Equals`).
- **Tests that can't fail.** Examples: `expect(x).toBeDefined()` after a `getBy*`, `length > 0`, an un-awaited `waitFor`, an `if` around the assertion, "is deterministic"/"is pure", or a constant asserted against a copy of itself.
- **Pins of constants, copy, or styling.** Tailwind class strings, label text, address tables, `staleTime` values. Pin these only when the value is a deliberate decision you'd want a review to catch.
- **The same behaviour twice.** Test logic once, at the lowest layer that owns it. Hooks, components and wrappers then get one wiring test, not a replay of the helper's input table. Same for a pure util in an app and a package: test it where it lives. Before adding a case, check it hits a branch no existing case covers.

Prefer `it.each` tables over copy-pasted `it` blocks that differ only by input, and file-local builders (`run(overrides)`, `makeX()`) over repeating the same args object. Reuse existing fixtures (`@ens-apps/migration/test-fixtures`, `src/test-utils`) rather than redefining them. Keep one test file per module.

## Testing

Run only the test files affected by your change, e.g.
`pnpm exec vitest run --maxWorkers=4 src/features/renew` from the app directory.
Do **not** run an app's full test suite unless asked; CI covers it.

## Package-Specific Documentation

When working in specific packages, consult these design documents:

### Transaction Manager
**Location**: `packages/transaction-manager/`
**Documentation**: `TRANSACTION_FLOW.md`

**Key Concepts**:
- Complete transaction flow architecture
- XState machine handling transaction lifecycle
- Integration with Rhinestone smart accounts
- EOA vs ERC-4337 transaction flows

**When to Consult**: When working on transaction submission, state management, or payment flows.

### Smart Account (Rhinestone HCA)
**Location**: `packages/smart-account/`
**Documentation**: `DEBUGGING_INTENTS.md`

**Key Concepts**:
- `InvalidSignature()` from the orchestrator is a wrapper — get the inner revert first
- Replaying a failed intent with `cast call --trace` + state overrides
- Validator error selectors, and the policy's exact-calldata checks
- Building a real signed intent outside the app to reproduce end-to-end

**When to Consult**: Any time a registration intent fails simulation, or before
changing the shape of a call in the commit/reveal batch.
