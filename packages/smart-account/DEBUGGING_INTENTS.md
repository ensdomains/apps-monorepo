# Debugging Rhinestone HCA intents

Field notes for the standalone-HCA registration flow (`src/providers/rhinestone/`).
Written after two production bugs that both surfaced as the same useless error.

## 1. `InvalidSignature()` almost never means the signature is wrong

A failed intent comes back from the orchestrator as:

```
Failed to submit transaction: Simulation failed: InvalidSignature()
  errorSelector: 0x8baa579f  category: INVALID_SIGNATURE
```

`0x8baa579f` is the **emissary re-wrapping whatever the validator actually
reverted with**. Both real bugs so far were policy failures with valid
signatures. Do not start debugging signing — get the inner revert first.

## 2. Get the inner revert with `cast`, no fork needed

The error payload contains everything required to replay the call: `call.to`,
`call.data`, `details.relayer`, `details.blockNumber`, and
`details.stateOverride`. Feed them to `cast call --trace` against an archive
RPC:

```bash
cast call <call.to> "$(cat calldata.hex)" \
  --from <details.relayer> \
  --block <details.blockNumber> \
  --rpc-url "$ARCHIVE_RPC" \
  --trace \
  --override-balance <relayer>:0xffffffffffffffffffffffffffffffff \
  --override-state-diff <token>:<slot>:<value>,<token>:<slot>:<value>
```

Notes:
- Use `--override-state-diff`, **not** `--override-state` — the latter replaces
  the account's entire storage and will wipe unrelated token state.
- A stale local Anvil fork will fail with `historical state ... is not
  available` / archive-token 403 once the upstream provider prunes. Point at an
  archive endpoint and pass `--block` instead of keeping a long-lived fork.
- The trace bottoms out at the real revert, e.g. `← [Revert] custom error
  0xe50c42ea`.

## 3. Decode the selector against the validator source

`HCAOwnerAndSessionValidator.sol` is **not on contracts-v2 `main`** — it lives on
the HCA PR branch. Fetch that one file; do not grep the repo (it will match
thousands of lines in `deployments/` and `lib/`):

```bash
git -C ../contracts-v2 fetch origin 'refs/pull/362/head:refs/remotes/pr/362'
git -C ../contracts-v2 show refs/remotes/pr/362:contracts/src/hca/HCAOwnerAndSessionValidator.sol > /tmp/HCAV.sol
rg -o "error \w+\([^)]*\);" /tmp/HCAV.sol | sed 's/error //; s/;//' \
  | while read -r s; do printf "%-42s %s\n" "$s" "$(cast sig "$s")"; done
```

Known selectors:

| selector | error | meaning |
|---|---|---|
| `0xe50c42ea` | `PolicyRuleFailed()` | a hardcoded policy argument check failed |
| `0xde1834f2` | `ActionNotAllowed(address,bytes4)` | target/selector outside the allowlist |
| `0x0672e151` | `GasRefundNotAllowed()` | quoted executor refund exceeded the session caps |
| `0x815e1d64` | `InvalidSigner()` | genuinely a bad signature |
| `0x9bdfc59f` | `InvalidSessionData()` | payload is not the Smart Session USE form |
| `0x037b5679` | `CallerNotIntentExecutor()` | presented by someone other than the IntentExecutor |
| `0x1fd05a4a` | `SessionExpired()` | `validUntil` elapsed |

A trace only ever reveals the **first** violation. After fixing one, re-check
the remaining calls against the policy loop rather than assuming.

## 4. The policy pins exact calldata — not just arguments

`_checkResolverDeployment` does not inspect `deployProxy`'s arguments. It
**reconstructs the whole calldata and compares keccak hashes**:

```solidity
bytes[] memory setters = new bytes[](0);            // hardcoded EMPTY
expectedInitData = abi.encodeCall(initialize, (account, ALL_ROLES, setters));
expectedCallData = abi.encodeCall(deployProxy, (PERMITTED_RESOLVER_IMPL, salt, expectedInitData));
if (keccak256(callData) != keccak256(expectedCallData)) revert PolicyRuleFailed();
```

`authorizeNameRoles` is pinned the same way, to
`(hex"00", ALL_ROLES, owner, true)` — which is why the root grant cannot be
narrowed to a per-name resource even though the resolver supports it.

Consequences:
- Record writes (`setAddr` `0x8b95dd71`, `setText` `0x10f13a8c`, …) **must** be
  standalone calls. Folding them into `initialize`'s `setters` is rejected
  before the resolver ever executes, even though the resolver would happily run
  them during initialization.
- Any change to how the resolver is deployed or initialized breaks this check.
  Assert new calldata against a policy-derived keccak in tests.

## 5. Reproduce end-to-end with a real signed intent

You can build and submit a genuinely signed intent outside the app — drive the
SDK exactly as the app does. No need to hand-roll the quote schema.

```ts
const init = await initializeRhinestoneAccount({
  ownerAccount: owner, eoaAddress: owner.address, chain: sepolia,
  publicClient: pc, rhinestoneApiKey: API_KEY,
})
const account = init.value.client        // NOT .account
const hca = init.value.address

const sess = await createDestinationSession({
  rhinestoneAccount: account, publicClient: pc, chain: sepolia,
  hca, resolver, sessionAccount, validUntil,
  alreadyDeployed: init.value.alreadyDeployed,
})

// leg 1: enable + commit (carries enableData), leg 2: reveal (session only)
const tx = await account.sendTransaction({
  sourceChains: [sepolia], targetChain: sepolia,
  calls, sponsored: { gas: false, bridging: false, swaps: false },
  feeAsset: 'USDC', tokenRequests: [], gasLimit: HCA_LEG_GAS_LIMITS.register,
  signers: { type: 'experimental_session', session, enableData?, verifyExecutions: true },
})
await account.waitForExecution(tx, false)
```

Gotchas that will silently invalidate the test:

- **Use a fresh owner.** The resolver is per-HCA, not per-name — an account that
  has registered before already has a deployed resolver and skips `deployProxy`
  entirely, so it cannot reproduce fresh-deploy bugs.
- **Fund the HCA with USDC directly** to skip the EIP-2612 permit leg when the
  permit isn't what you're testing.
- Wait `MIN_COMMITMENT_AGE` (read it, don't hardcode) between the two legs.
- You do not need a *successful* registration to clear a policy bug: if the
  batch fails on something later (e.g. a missing commitment), the policy check
  already passed.

## 6. Session caps live in the salt

`MAX_REFUND_AMOUNT` / `MAX_REFUND_GAS_OVERHEAD` / `MAX_REFUND_EXCHANGE_RATE`
(`manifest.ts`) are baked into the destination session salt via
`computeDestinationSessionSalt`, so the salt — and therefore the permissionId —
changes when they do. A quoted refund above the cap reverts with
`GasRefundNotAllowed()`, again surfaced as `InvalidSignature()`.

When reading a failing intent's fields, note the big `uint256` next to the
account address is the **nonce**, not the salt. Confirm with `cast to-dec`
before comparing it against anything.
