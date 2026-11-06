# PR #1703 registration owner-setup model

This model covers the delegated-wallet approval fallback introduced by PR #1703.
The fallback changes only the setup intent to owner authority; the reveal must
retain the registration session.

It checks that:

- an invalid setup preflight cannot reach approval consent;
- approval consent precedes any owner signature;
- cancellation signs nothing;
- the prepared route contains exactly the locally requested calls;
- no token claim, swap, source operation, or other authority is accepted;
- the fresh setup fee stays within the setup amount reviewed during budgeting;
- the exact allowance is rechecked before signing;
- setup leaves the reserved reveal balance intact;
- reveal returns to the session signer.

`Current.cfg` represents the PR head. It validates the pre-approval quote,
fresh route, extra authority, allowance, cancellation, and signer restoration,
but does not bind the fresh transport quote's refund amount to the reviewed
setup-leg budget. TLC therefore finds the fee
counterexample. `Hardened.cfg` enables that final guard and must pass.

Run:

```sh
bash formal/verify-pr-1703.sh
```

The script also removes each guard individually and requires TLC to find a
counterexample, proving that each invariant is load-bearing.
