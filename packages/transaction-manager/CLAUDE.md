# Transaction Manager

XState v5 machines orchestrate transactions. A `Signer` is the capability to sign (wallet, account), not a signature.
Design: `docs/TRANSACTION_FLOW.md` (lifecycle, states), `docs/SIGNERS.md` (the idea; the union in `src/types/signer.types.ts` wins: `EOASigner | RhinestoneSigner`), `docs/ARCHITECTURE.md`.

- All transaction state lives in the machine (`src/machines/`), never in ad-hoc React or module state.
- Transport actors (`src/actors/*-transport.actor.ts`) are pure: every input is a parameter, no module state. Rhinestone submits through `warp-transport.actor.ts`. There is no `rhinestone-transport.actor.ts`.
- Async work returns `ResultAsync`; use `errAsync`/`okAsync` there and `err`/`ok` only for sync `Result`.
- Wire `ResultAsync` actors with `fromResultAsync` from `@ens-apps/utils/xstate/neverthrow`; don't unwrap.
- Sync code that can throw: `fromSync` from `@ens-apps/utils/neverthrow`, not try/catch and not `Promise.resolve().then`.
- Adding a signer type: skill `add-signer`.
