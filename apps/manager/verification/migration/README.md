# ENS manager migration formal model

This trial checks the ENS manager v1 to v2 migration promises at source commit
`6977db2d7d14a8d6c48436d97d4fee6ed703285b`.

The model states 37 user-facing properties from A1 through G5. It does not copy
the current implementation as the desired result. `Current.cfg` records the
observed implementation choices, while `Hardened.cfg` enables every required
guard.

## Model shape

`Model.tla` selects one small scenario for each promise. This keeps a failed
property attributable to one product flow and makes every guard independently
sensitive. The scenarios include two tabs, two names, crash and reload points,
wallet rejection, unavailable receipts, concurrent journal writers, stale
recovery cleanup, retry rehydration, partial completion, and pending work.

The shared `CORE` scenario executes an integrated lifecycle:

1. start a run;
2. persist an intent and recovery route;
3. open one wallet prompt;
4. record the transaction hash;
5. block while its receipt is unavailable;
6. resolve, verify, and checkpoint it;
7. finish temporary-grant cleanup;
8. claim completion.

This is an exhaustive check of the finite abstraction, not a proof of the
TypeScript, browser, RPC implementation, contracts, or every cross-product of
all 37 scenarios. The source map and Vitest witnesses connect the abstraction
to reviewed code.

## Files

- `Model.tla` defines the current and hardened migration scenarios and all 37
  invariants.
- `MigrationContract.tla` defines the composable assume and guarantee boundary.
- `Current.cfg` checks the implementation facts observed at the sync commit.
- `Hardened.cfg` enables all guards and must pass.
- `Contract.cfg` proves the integrated model refines the contract.
- `No<Guard>.cfg` files remove one hardened guard and must fail the named
  invariant with TLC exit code 12.
- `current-expectations.tsv` records whether each current-code property holds or
  has a counterexample.
- `sensitivity.tsv` maps every mutation config to its guard and invariant.
- `real-code-matrix.test.ts` checks classification, routing, and journal
  reconciliation matrices against real TypeScript.
- `verify-source-map.mjs` refuses to validate a source revision that was not
  reviewed.
- `verify-sensitivity.sh` checks the current, hardened, contract, and all
  mutation configurations.
- `Model.view.mjs` gives pstack statechart reports product-language state and
  action names.

## Run

From the repository root, run the complete verifier:

```sh
formal/verify-migration.sh
```

The runner uses mise-provided Temurin Java 25 and `tla2tools` 1.7.4. It:

- verifies the covered source paths still match the sync commit;
- checks every current property independently;
- proves the hardened and contract configurations;
- proves all 37 mutation configurations fail for the intended reason;
- runs the green real-code matrices;
- runs four real-code regression witnesses and requires each one to remain red.

Set `FORMAL_OUT_DIR` to retain logs in a chosen directory. Otherwise the runner
uses the system temporary directory.

For a product-language counterexample report and Mermaid chart, use pstack
`/skill:statechart` with `Model.tla`, `Current.cfg`, and `Model.view.mjs` in a
scratch directory outside the repository.

## Contract composition

`MigrationContract.tla` exports one record variable, `contractState`, lifecycle
actions, `EnvironmentAssumptions`, and `Guarantees`. The environment promises an
honest but racy journal, chain, and wallet, valid contract state, and fair
responses. The migration guarantees one prompt per scope, cancellation safety,
durable intent before prompting, pending-submission tracking, verified and
checkpointed completion, temporary-grant cleanup, and recovery coverage.

`Model.tla` maps the integrated implementation state to `contractState` and
instantiates the interface:

```tla
Contract == INSTANCE MigrationContract
  WITH Tabs <- Tabs,
       Names <- Names,
       HonestJournal <- HonestJournal,
       HonestChain <- HonestChain,
       HonestWallet <- HonestWallet,
       FairResponses <- FairResponses,
       contractState <- ContractState
```

A composing specification can use the same pattern. Map its concrete state to a
record with the fields required by `MigrationContract.TypeOK`, include the
contract lifecycle actions in its `Next`, establish `Contract.EnvironmentAssumptions`,
and check `Contract.Guarantees` as an invariant. If the composing model owns
wallet or chain progress, it must also discharge the fair-response assumption.

`Contract.cfg` checks `ContractRefinement`, the assumptions, and the guarantees
against the full model's `CORE` behavior.

## Updating the verification

When a covered source file changes:

1. inspect the source diff from the recorded sync commit;
2. update model actions, guards, assumptions, and real-code witnesses where the
   implementation semantics changed;
3. run `formal/verify-migration.sh`;
4. deliberately break each changed guard in a scratch copy and confirm its
   mutation config still fails;
5. update the sync commit only after the mapping has been reviewed.

Do not advance the sync commit only because TLC passes. The provenance check
proves sameness to reviewed source, not behavioral equivalence.
