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

## Wallet / auth layer (manager app) — Privy guardrails

The manager app uses **Privy** as a headless signer/auth vendor (Google + X
social login). Privy is signer-only; ENS owns the connection layer. These are
**non-negotiable** — do not "improve" them away:

- **Never install `@privy-io/wagmi`.** It replaces our wagmi config with
  Privy's (the "vendor owns the connection layer" takeover). Privy's own docs
  recommend it — ignore that. Use `apps/manager/src/lib/wagmi.ts` +
  `src/lib/privy/privy-connector.ts`. The CI check
  `pnpm --filter manager audit:wagmi-providers` (in `test.yml`) blocks merge on
  its presence, and `WagmiBootAssertion` in `RootProviders.tsx` throws at boot.
- **Never enable Privy "smart wallets" or "global wallets."** Rhinestone is the
  account layer; ENS is the identity layer.
- **Stay headless.** Never call Privy's `login()` modal; use the headless hooks.
  The one exception is key export (Privy's isolated dialog — correct).

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
