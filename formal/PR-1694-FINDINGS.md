# PR #1694 verification findings

Verified against merged PR #1694 on `main` at
`0fadce5156326f30af42eb1a47d01554631765d8`.

The consent decision is exhaustively called for every pair of USDC and
rent-token debits at zero, one, and two whole cents, including the absence of
an earlier confirmation.
The implementation asks for confirmation exactly when either coin increases.
The state-machine ordering, cancellation, stale-attempt, prompt-receipt, and
approval-step properties hold in the formal model, including the latest
quote-state and abandoned-attempt refactors.

The updated receipt still does not carry
`HcaFundingPrompt.token.hasUnlimitedAllowance`. A DAI prompt with an existing
unlimited allowance therefore returns `undefined` instead of keeping the
warning visible. The regression test intentionally fails on this PR head, and
the current-head model finds the same disclosure counterexample.
