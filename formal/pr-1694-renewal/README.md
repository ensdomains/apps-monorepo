# PR #1694 renewal consent model

This model enumerates USDC and rent-token debit changes independently. It
checks that any increase in either coin requires fresh consent, cancellation
signs nothing, stale attempts cannot own the prompt, the pending attempt's
receipt remains visible, and a permit in either coin produces the approval
step.

It also checks that an unlimited rent-token allowance remains disclosed on the
updated receipt. `Current.cfg` represents the PR head and intentionally finds
that disclosure counterexample. `Hardened.cfg` enables the missing disclosure
and must pass.

Run:

```sh
bash formal/verify-pr-1694.sh
```

Every guard is then removed individually and must change the model verdict.
