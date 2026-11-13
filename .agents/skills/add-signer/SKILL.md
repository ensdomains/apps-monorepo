---
name: add-signer
description: Add a signer type to the transaction manager. Use when adding a wallet or account type that must sign through packages/transaction-manager.
---

A `Signer` is a capability to sign, not a signature. The current union is `EOASigner | RhinestoneSigner` in `packages/transaction-manager/src/types/signer.types.ts`. `docs/SIGNERS.md` still mentions Privy, ERC-4337, and Safe as signer variants; those variants are not in the code. Safe is handled on the EOA path (`src/helpers/safe-execution.helpers.ts` and the EOA signer's connector), not as its own variant.

1. Add the variant to `Signer` in `src/types/signer.types.ts` and export it from `src/index.ts` (the existing `export type` block).
2. Add a pure transport under `src/actors/`. Every input is a parameter. Return `ResultAsync`. Rhinestone already goes through `src/actors/warp-transport.actor.ts`. There is no `rhinestone-transport.actor.ts`. EOA is `eoa-transport.actor.ts` and `eoa-batch-transport.actor.ts`.
3. Route `signer.type` inside `submitTransaction` in `src/machines/transaction.machine.ts`. The `default` arm uses `satisfies never`, so a new variant is a type error until it has a case.
4. Use `errAsync` / `okAsync` when the return type is `ResultAsync`. Wire the actor with `fromResultAsync` from `@ens-apps/utils/xstate/neverthrow`. Sync code that can throw uses `fromSync` from `@ens-apps/utils/neverthrow`, not try/catch and not `Promise.resolve().then`. Errors are the classes in `src/errors/transaction.errors.ts`, not a new plain `Error`.

Read `docs/TRANSACTION_FLOW.md` for the lifecycle and `docs/ARCHITECTURE.md` for the package shape.
