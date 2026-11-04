# Registration payment formal model

This model checks the registration payment rule in
[`BEHAVIOUR.md`](../../src/features/register-v2/workflow/pricing/BEHAVIOUR.md):
while payment is in flight, the methods and figures stay as they were when the
user clicked.

It treats React commits, TanStack Query updates, fallback effects, mutation
state notifications, and continuations after `await` as independently ordered
actions. That is the gap ordinary table tests do not explore.

## Properties

`RegistrationPayment.tla` checks that:

- the in-flight sheet displays the exact method and figures confirmed at the
  click;
- neither user nor fallback selection rewrites the accepted rail while the
  attempt is pending;
- an actor selection change aborts rather than starting from a stale click;
- `registration.start` uses the confirmed method and consent-relevant payment
  bounds, not later query-derived values.

The methods include two distinct L2 routes so a silent chain switch is visible
to TLC.

## Models

- `RegistrationPayment.cfg` maps the current implementation. It is expected to
  fail and produce a counterexample.
- `RegistrationPaymentHardened.cfg` models atomic click-time capture and is
  expected to pass.
- The `RegistrationPaymentNo*.cfg` models are mutation tests. Each removes one
  protection and must fail its named invariant, proving the main model is
  sensitive to that protection.

## Run

First run the provenance check from the repository root:

```sh
node apps/manager/verification/registration-payment/verify-source-map.mjs
```

The checker validates that the covered paths are tracked and unchanged from the
reviewed baseline `0fadce5156326f30af42eb1a47d01554631765d8` (rebased main,
including merged PR #1708). It does not infer runtime behavior from source text
or validate model constants. The reviewed differences and model-to-code mapping
are recorded in the
[coverage record](../../../../.pi/skills/verify-manager-registration-payment/SKILL.md#coverage-record).

Then use pstack `/skill:statechart` with the model, current config, and view in
this directory. It reports every current invariant failure in product terms.

Finally run the mutation checks:

```sh
apps/manager/verification/registration-payment/verify-sensitivity.sh
```

The sensitivity script installs pinned TLC and Java tools through `mise`, checks
the expected current failure, proves the hardened model passes, and proves each
mutation model fails its named invariant. Logs and TLC state metadata are
written to the temporary directory printed at the end. Set `FORMAL_OUT_DIR` to
retain them at a chosen location.

At the synchronized commit, `/skill:statechart` reports that the clicked view,
pending selection, and eventual start data can diverge from the click. The
actor-snapshot abort still prevents a changed XState selection from starting.

The executable behavior witnesses are the intentionally failing Vitest
regressions that live with the production
code in `TokenPickerContent.test.tsx` and
`TokenPickerContent.confirmation.test.tsx`. They are kept out of this formal
model directory so the executable code repros and the TLA+ abstractions remain
visibly separate. All three remain in the normal test suite and are expected
to fail until production behavior is fixed in a separate change.

## Updating the model

When a covered source file changes:

1. inspect the source diff rather than only advancing the sync commit;
2. update actions, atomic boundaries, constants, and invariants as needed;
3. run `verify-sensitivity.sh`;
4. update `SYNC_COMMIT` in `verify-source-map.mjs` and the coverage record to the
   reviewed commit.

A passing hardened model proves the modeled protections within its scope.
Connecting that model to production requires the reviewed coverage record and
executable behavior witnesses; a passing provenance check alone cannot do so.
