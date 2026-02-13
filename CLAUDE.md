# ENS Apps Monorepo - Claude Instructions

## Style Guide

All coding guidelines, patterns, and conventions are documented in **[STYLEGUIDE.md](./STYLEGUIDE.md)**. Follow the rules and patterns defined there.

## PR Conventions
- Branch naming, if initiated from a linear ticket: `linear/<linear-ticket-id>`
- Keep PRs focused on the ticket scope
- Do NOT include raw ticket descriptions in PR bodies
- Summarize changes made, not the full requirements

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
