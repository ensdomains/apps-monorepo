# ENS Apps Monorepo - Claude Instructions

## Style Guide

All coding guidelines, patterns, and conventions are documented in **[STYLEGUIDE.md](./STYLEGUIDE.md)**. Follow the rules and patterns defined there.

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
