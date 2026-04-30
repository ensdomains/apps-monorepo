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
