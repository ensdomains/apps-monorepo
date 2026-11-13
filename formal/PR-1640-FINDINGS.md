# PR #1640 verification findings

Verified against merged PR #1640 on `main` at
`82fc7fcb21a1cfdd7243a28e2ff18e49113f326f`.

The real `resolveRenewalSigner` and `getRenewalPaymentRoute` functions are
called over all 36 combinations of signer, Safe status, wallet-client presence,
and connector presence. Every combination selects the expected single route.

The formal workflow preserves the current-main L2 renewal requirement:
non-Safe HCA renewals stay on the intent route and bridge selected L2 funding
before submission. It distinguishes single-v1, single-v2, and bulk-v2; only
single-v2 intent renewal has the pricing smart-session prerequisite.

## Outstanding production regressions

Two executable regression tests intentionally fail against this PR head:

- `useBulkRenew.test.tsx` runs the bulk-renewal hook and real Safe signer
  resolution with a connected wallet, resolved prices, and failed HCA
  initialization. The wallet route resolves, but `payment.canProceed` remains
  false because it depends on HCA connectivity.
- `WalletSection.test.tsx` holds Safe detection pending with an initialized
  account and attempts session authorization through the rendered control.
  The unsupported authorization callback is reachable before detection settles.

The expanded formal current-head configuration finds the pending-control
counterexample, and a separate configuration finds the wallet route's HCA
connectivity dependency. The hardened configuration passes when both missing
guards are enabled. All sensitivity runs require TLC exit code 12 and the named
invariant; tool, parser, configuration, and unrelated failures are rejected.

## Regression check

Reviewed the single-renewal `PaymentCard` protocol branch, bulk renewal hook,
wallet session controls, route selectors, and L2 pre-bridge callers. Existing
assertions changed: none. Added the 36-case route matrix and the two focused
hook/UI regressions. Production behavior changes: none.
