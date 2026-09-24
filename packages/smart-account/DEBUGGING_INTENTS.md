# Debugging Rhinestone HCA intents

Field notes for the standalone-HCA registration flow (`src/providers/rhinestone/`).
Written after several production bugs that all surfaced as the same useless
error. None of them were signature problems.

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

Credentials live outside the repo — look them up, don't hunt for a `.env`:

```bash
gh variable list                      # VITE_RHINESTONE_API_KEY
```

The Sepolia endpoint in `packages/indexer/chain.ts` (drpc.live) serves archive
state, so it works for the replays below.

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

Read the source the validator was **built from**, not a contracts-v2 branch —
branches carry variants that differ. Each deployment artifact names its
build-info, which embeds every source file verbatim. Do not grep the repo (it
will match thousands of lines in `deployments/` and `lib/`):

```bash
NS=contracts/deployments/sepolia
BI=$(git -C ../contracts-v2 show "HEAD:$NS/HCAOwnerAndSessionValidator.json" | jq -r .buildInfoId)
git -C ../contracts-v2 show "HEAD:$NS/build-info/$BI.json" \
  | jq -r '.input.sources["project/src/hca/HCAOwnerAndSessionValidator.sol"].content' > /tmp/HCAV.sol
rg -o "error \w+\([^)]*\);" /tmp/HCAV.sol | sed 's/error //; s/;//' \
  | while read -r s; do printf "%-42s %s\n" "$s" "$(cast sig "$s")"; done
```

The policy libraries (`HCAResolverPolicyLib.sol`, `HCARegistrarPolicyLib.sol`)
are in the same build-info under `project/src/hca/libraries/`.

Known selectors:

| selector | error | meaning |
|---|---|---|
| `0xe50c42ea` | `PolicyRuleFailed()` | a hardcoded policy argument check failed |
| `0xde1834f2` | `ActionNotAllowed(address,bytes4)` | target/selector outside the allowlist |
| `0x0672e151` | `GasRefundNotAllowed()` | quoted executor refund exceeded the session caps |
| `0x815e1d64` | `InvalidSigner()` | a bad key **or** a session that was never enabled — see below |
| `0x9bdfc59f` | `InvalidSessionData()` | payload is not the Smart Session USE form, or the enable proof is expired (`validUntil`), carries a stale session nonce, or has zero refund caps |
| `0x037b5679` | `CallerNotIntentExecutor()` | presented by someone other than the IntentExecutor |
| `0xf679d4db` | `InvalidOperationEncoding()` | operation data is not an ERC-7579 operation payload — usually the wrong outer signature mode, see §9 |
| `0xbff8a462` | `OwnerUnavailable()` | the account returned no owner from `ownerAndSessionNonce` |

The previous validator reverted `SessionExpired()` (`0x1fd05a4a`) for an elapsed
`validUntil`; the 2026-09-15 one folds that into `InvalidSessionData()`.

A trace only ever reveals the **first** violation. After fixing one, re-check
the remaining calls against the policy loop rather than assuming.

`InvalidSigner()` is the misleading one — it has three call sites in
`_validateFixedSessionPayload` alone, and only the last is an actual key
mismatch. **Use the trace depth to tell them apart:** if it reverts *before*
`5aa6d3a9` (`ownerAndSessionNonce`) and *before* `ecrecover`, nothing was
recovered and it is the very first check,
`config.sessionKey == address(0)` — an unenabled session (§7), not a bad key.

## 4. The policy pins exact calldata — not just arguments

`HCAResolverPolicyLib.checkDeployment` decodes `deployProxy`'s arguments,
checks them, then **re-encodes the call around its own constants and compares
keccak hashes** (validator `0x6a62af42`, the 2026-09-15 Sepolia deployment):

```solidity
(address impl, uint256 salt, bytes memory initData) = abi.decode(args, ...);
if (impl != implementation || selector(initData) != initialize.selector) revert PolicyRuleFailed();
(Grant[] memory grants, bytes[] memory calls) = abi.decode(args(initData), ...);
if (grants.length != 2 ||
    grants[0] != (account, ALL_ROLES) ||          // the HCA
    grants[1] != (owner,   ALL_ROLES)             // the wallet
) revert PolicyRuleFailed();
_checkCalls(calls);                                // each must be a record setter
expectedCallData = abi.encodeCall(deployProxy,
    (implementation, salt, abi.encodeCall(initialize, (grants, calls))));
if (keccak256(callData) != keccak256(expectedCallData) ||
    resolverAddress(account, salt, factory, proxyLogic) != resolver
) revert PolicyRuleFailed();
```

The wallet's roles are granted **here**, as `grants[1]` — there is no trailing
`authorizeNameRoles` call any more. That function is gone from
`PermissionedResolver` (`0xbbd9abb5`) and the policy does not accept it.

Consequences:
- The grants array is exactly two entries in that order. The older single-grant
  form reverts `PolicyRuleFailed()`.
- `initialize`'s `calls` may carry record setters — `checkCall` accepts
  `setAddress`, `setText`, `setContenthash`, `setABI`, `setData`,
  `setInterface`, `setName`, `linkToNode`, `linkToRecord` and a `multicall` of
  those. The previous (hackathon) validator hardcoded `calls` empty, so do not
  assume either without reading the deployed source (§3). We send it empty and
  write records as standalone calls, which both validators accept.
- The CREATE2 address derived from the salt must equal the session's resolver, so
  a stale `verifiableFactoryProxyLogic` fails here even when the calldata matches.
- Record setters are the **V2** shapes, which take the DNS-encoded name:
  `setAddress` `0xb4436dde`, `setText` `0xc7279f88`. The v1 `PublicResolver`
  shapes (`setAddr` `0x8b95dd71`, `setText` `0x10f13a8c`) are rejected twice
  over — not accepted by the policy, and not implemented by the resolver.
- Any change to how the resolver is deployed or initialized breaks this check.
  `registration-calls.test.ts` reconstructs the policy's expected calldata and
  asserts keccak equality; keep that in step.

The validator exposes its pinned addresses as public getters
(`VERIFIABLE_PROXY_LOGIC()`, `PERMITTED_RESOLVER_IMPL()`, `VERIFIABLE_FACTORY()`,
`ETH_REGISTRY()`, `DEFAULT_REVERSE_REGISTRAR_HCA_ADAPTER()`,
`REVERSE_REGISTRAR_HCA_ADAPTER()`), so after any redeploy read them off chain
rather than trusting the manifest. Selectors are not exposed; they come from the
interfaces in the source.

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

// leg 1: commit, leg 2: reveal — BOTH carry enableData (§7)
const tx = await account.sendTransaction({
  sourceChains: [sepolia], targetChain: sepolia,
  calls, sponsored: { gas: false, bridging: false, swaps: false },
  feeAsset: 'USDC', tokenRequests: [], gasLimit: HCA_LEG_GAS_LIMITS.register,
  signers: { type: 'experimental_session', session, enableData: sess.enableData, verifyExecutions: true },
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

## 7. Every session signature carries the owner's authorization

The 2026-09-15 validator (`0x6a62af42`, contracts-v2 #426) is **stateless**.
There is no `enableSessionWithRefund`, no `revokeSessions()`, and
`isPermissionEnabled` always returns `false`. The only session envelopes it
accepts carry the owner's multi-chain authorization inline:

| mode | constant | meaning |
|---|---|---|
| `0x04` | `FIXED_SESSION_PERMIT2_ENABLE_MODE` | cross-chain (Permit2), with proof |
| `0x05` | `FIXED_SESSION_REFUND_ENABLE_MODE` | same-chain, with proof |

Anything else — including the old `0x01`/`0x02` steady-state modes — reverts
`InvalidSessionData()` in `_validateFixedSession`. So:

- **`enableData` goes on every session-signed intent**, commit and reveal
  alike. The Warp transport attaches the session's own proof
  (`RhinestoneSessionContext.enableData`) and refuses to submit a
  session-signed intent without one.
- **`enableData.hcaSessionConfig` is required.** The SDK patch packs the
  session config into the proof; without it, it falls back to decoding an
  `enableSessionWithRefund` call from the batch, and the policy rejects any
  execution that targets the validator.
- **No validator call in the batch.** `_checkRegistrationExecutions` has no
  branch for the validator itself, so such a call reverts `ActionNotAllowed`.

The SDK patch (`patches/@rhinestone%2Fsdk@1.8.0.patch`) must be the one
contracts-v2 ships for this validator (`patches/` at the deployment commit).
A stale patch still signs a valid-looking envelope, just in the wrong layout,
and the validator bails out after ~2k gas.

### Read the envelope before anything else

The validator signature starts after the 20-byte zero prefix. For mode
`0x05`, `_decodeSessionEnableProof` and `_validateFixedRefundSessionEnablePayload`
read it tightly packed:

| bytes | field |
|---|---|
| 1 | mode `0x05` |
| 32 | permissionId |
| 20 · 6 · 12 | sessionKey · validUntil (uint48) · sessionNonce (uint96) |
| 20 · 20 | resolver · refundToken |
| 12 · 6 · 12 | maxRefundExchangeRate · maxRefundGasOverhead · maxRefundAmount |
| 1 · 1 | sessionToEnableIndex · chainCount |
| 40 × n | chainId (uint64) ‖ sessionDigest, per chain |
| 65 | owner signature over the multi-chain authorization |
| 32 | intent nonce |
| 20 · 12 · 12 · 6 | refund token · exchangeRate · refundAmount · gasOverhead |
| … | packed ERC-7579 operation |
| 65 | session-key signature |

An ABI-encoded proof (32-byte words, a 4-byte length after the permissionId)
is the previous validator's layout: `chainCount` then reads a padding zero,
the decoder returns `proofEnd = 0`, and the call reverts `InvalidSessionData()`
almost immediately — the 2026-09-16 manager failure.

The previous (stateful) validator enabled sessions on-chain via
`enableSessionWithRefund` and accepted proof-less `0x01`/`0x02` envelopes
afterwards; its failure modes (and the SDK stripping the proof once a session
was enabled) are in this file's git history.

## 8. `UnclassifiedRevert` — replay it before guessing

```
Simulation failed: UnclassifiedRevert
  errorSelector: 0x00000000  category: UNCLASSIFIED_REVERT  retryable: false
```

A zero selector only means the orchestrator could not classify the revert
data it saw, and the router (`0x000000000004598d…`) re-reverts **empty** when
the IntentExecutor fails. So this can be either:

- a validator rejection — the IntentExecutor reverts `InvalidSignature()`
  (`0x8baa579f`) with the validator's error one frame below it, and the router
  swallows both; or
- a batched call reverting with data the orchestrator does not know (a plain
  `Error(string)` from an ERC-20, say).

Replay the `fill` call from §2 with the error's `details.stateOverride` and
read the deepest revert. On 2026-09-16 this was `InvalidSessionData()` from
`isValidSignatureWithSender` after 2338 gas — a stale SDK patch (§7), not a
batch problem.

If the validator passed, decode `simulations[].call.data` and check each
destination op against **live chain state for that user**. The ops decode
straightforwardly:

| `to` | selector | call |
|---|---|---|
| USDC | `0x095ea7b3` | `approve(paymaster, refund)` — the gas refund |
| USDC | `0xd505accf` | `permit(owner, spender, value, deadline, v, r, s)` |
| USDC | `0x23b872dd` | `transferFrom(wallet, HCA, value)` |
| registrar | `0xf14fcbc8` | `commit(bytes32)` |

```bash
cast call <usdc> 'balanceOf(address)(uint256)' <permit.owner> --rpc-url "$RPC"
cast call <usdc> 'nonces(address)(uint256)'    <permit.owner> --rpc-url "$RPC"
```

The first real instance: `permit`/`transferFrom` for `20196054` against a wallet
holding `20000000`. `transferFrom` reverts `ERC20: transfer amount exceeds
balance`, and since the batch is atomic the whole intent fails.

**Why it hits only some users.** The funding permit is signed for the whole HCA
budget — `registrationPrice + commitCost + registerCost` — while the pricing UI
gates on `registrationPrice` alone. On Sepolia the two legs have run to ~12 USDC
against an 8 USDC name, so any wallet holding between the price and the budget
clears checkout and then fails simulation. `signFundingPermitActor` now reads
`balanceOf(wallet)` and refuses before the wallet is ever prompted; if this
error resurfaces, check that gate first.

Note that `checkingHcaFunding` reads the **HCA's** balance, not the wallet's —
it decides whether a permit is needed at all, and never validated that the
wallet could honour one.

## 9. The outer signature mode is an authorization decision

`resolveSignatureMode` (SDK patch) picks one `SIG_MODE_*`, and the orchestrator
stamps it into the packed operation's first two bytes — the `0x02NN` prefix the
validator decodes in `HCAOperationHashLib`. The two are the same field:

| SDK constant | op mode | validator |
|---|---|---|
| `SIG_MODE_ERC1271` (1) | `0x0201` | accepted — **but owner mode, see below** |
| `SIG_MODE_EMISSARY_EXECUTION` (4) | `0x0204` | `isSupportedMode` only, not `isERC1271Mode` |
| `SIG_MODE_EMISSARY_EXECUTION_ERC1271` (5) | `0x0205` | **rejected** `InvalidOperationEncoding()` |
| `SIG_MODE_ERC1271_EMISSARY_EXECUTION` (6) | `0x0206` | accepted |

So a standalone HCA has exactly one safe mode, **6**:

- Mode 1 is the Immunefi #91014 bypass. The IntentExecutor reads the outer mode
  as the principal; owner mode settles the refund through `settleGasRefund()`
  instead of `settleGasRefund_requireCallback()`, letting a session key drain
  the account through refund parameters.
- Mode 5 is safe but the deployed validator (`0x6a62af42`) does not decode it —
  `isERC1271Mode` accepts only `0x0201` and `0x0206`.

The mode-5 failure looks nothing like a mode problem: the envelope parses, the
owner `ecrecover` returns the right address, `_checkGasRefund` passes, and only
then `_decodeERC1271Operation` reverts. **Read the first two bytes of the packed
op** (§7's last table row) before assuming the operation bytes are malformed.

Confirm a mode diagnosis by flipping those two bytes in the replayed calldata —
in both the outer `ops` field and the copy inside the validator signature — and
re-running §2. Getting further, to `InvalidSigner()`, proves the mode was the
only blocker; the session key signed the original bytes, so that last failure is
expected.
