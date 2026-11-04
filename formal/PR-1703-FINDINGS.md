# PR #1703 verification findings

Verified against the exact PR #1703 head
`4df2bc4c1770993ea351ef3cac9b3f3be02e86a4`.

The updated PR now validates both the live SDK owner-signing payload and the
prepared operations before signing. Exhaustive route-shape tests cover changed
calls, ordering, chains, recipients, token movements, swaps, signing domains,
funding modes, fee token, packed refund limits, malformed values, and extra
authorizations.

The latest head also preflights the owner setup quote before asking for the
funding approval. The formal model verifies that an invalid preflight cannot
reach consent, cancellation signs nothing, the exact allowance is rechecked,
and reveal returns to the session signer.

One invariant remains open. Transport prepares a fresh quote after approval,
but the owner setup's refund amount ceiling is inherited from the session
ceiling rather than bounded by the reviewed registration funding grant. The
legacy session ceiling is 100 USDC while the executable fixture's entire
reviewed grant is 15 USDC. The fresh setup can therefore pass route validation
while being authorized to consume more than the reviewed grant and the funds
reserved for reveal.

The regression test intentionally asserts that the owner setup refund ceiling
cannot exceed the reviewed grant. It fails with `100000000` versus `15000000`.
The formal current-head configuration finds the corresponding fresh-quote
counterexample; the hardened configuration passes when that fee is bound to
the reviewed setup amount.
