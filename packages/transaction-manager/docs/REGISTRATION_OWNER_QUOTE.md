# Mainnet registration owner quote

Review follow-up for PR #1703, checked on 2026-11-04.

## Live result

An authenticated `RhinestoneAccount.prepareTransaction` against the production
`POST /intents/route` endpoint returned HTTP 200 for a fresh, undeployed mainnet
HCA. Initialization checked its deployment state over mainnet RPC and returned
`alreadyDeployed: false`. The SDK included the manifest's factory deployment in
`account.setupOps`.

The requested destination calls were exactly:

1. Mainnet USDC `transferFrom(fixtureOwner, fixtureHca, 15_000_000)`.
2. The manifest's ETH registrar `commit(bytes32(0))`.

The request used `sourceChains: [mainnet]`, `targetChain: mainnet`, no session
signers, no sponsorship, `feeAsset: 'USDC'`, `tokenRequests: []`, and
`auxiliaryFunds: { 1: { [mainnetUsdc]: 15_000_000 } }`, matching the owner setup
transport. The zero commitment was a quote fixture; it was never submitted.

The response reported `INTENT_EXECUTOR`, `NO_FUNDING`, and ERC-7579/ERC-1271
execution, but also included:

- A USDC approval requirement to Permit2.
- Nonempty `idsAndAmounts` and `spendTokens`.
- A preclaim USDC approval to Permit2.
- An additional destination USDC approval before the two requested calls.

`checkOwnerIntentRoute` correctly rejected this response. Normalizing the
auxiliary token address and excluding source portfolio assets did not remove
those operations. The new pre-approval quote adapter was also run against the
live endpoint and rejected its response.

The probe used a fresh fixture owner whose signing methods throw. It did not
request an approval, sign an intent, call `submitTransaction`, deploy the HCA,
or submit a mainnet transaction. Authentication material was not recorded in
the evidence.

## Approval boundary

Before requesting a new registration funding approval, build the exact owner
setup request and quote it with its declared incoming USDC. Apply the same
call and fee-limit validation that transport applies before signing. A quote
failure or unsupported route ends preparation before approval consent, wallet
submission, or creation of an approval-recovery record.

Ordinary compatible or inconclusive permits continue through the original
permit batch without this owner quote. Existing grants still undergo the
transport's fresh validation before owner signing.

The pre-approval check does not reserve a quote. Transport continues to obtain
and validate a fresh quote immediately before signing, so a later route or
fee change can still stop setup after an independently consented approval.

## Remaining compatibility blocker

The live result does not establish a working owner-funded registration route.
The planner must return a supported route, or its additional operations need
an independently justified authorization design. Do not weaken the call,
claim, or fee checks merely to accept the response. Live relayer fill and
extension-wallet execution remain unverified. The local-fork registration
evidence in the PR is separate from this live quote result.
