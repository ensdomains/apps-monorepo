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
| `0xf679d4db` | `InvalidOperationEncoding()` | operation data is not an ERC-7579 operation payload |
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

## 7. The session-enable proof belongs on EVERY commit

`enableData` (the `SessionEnableProof`) is what selects the validator's
first-use policy path. It is tempting to omit it once the session is enabled
on-chain — the handoff doc says to, and `experimental_isSessionEnabled` exists
to check. Doing so has broken production twice, in two *different* ways, both
arriving as `InvalidSignature()`:

| batch | without the proof | inner revert |
|---|---|---|
| carries `permit` + `transferFrom` | falls through to `_checkRegistrationExecutions`, whose payment-token branch allows only `approve` | `ActionNotAllowed(USDC, 0xd505accf)` `0xde1834f2` |
| no funding pair | SDK signs mode `0x02`, but `_sessions[hca][permissionId]` is still empty on a session's first use | `InvalidSigner()` `0x815e1d64` |

Two independent conditions require the proof — *"we are funding"* and *"the
session is not enabled yet"* — so gating on either one alone leaves the other
broken. That is exactly how the second bug was introduced while fixing the
first. **Attach it unconditionally:**

- **idempotent** — `_enableSessionFor` rewrites the same slot with identical
  values; there is no "already enabled" revert.
- **reusable** — `_validateSessionEnableProof` checks only `validUntil` and the
  account's session nonce, and nothing increments that nonce outside
  `revokeSessions()`.
- **no wallet prompt** — `buildHcaSessionEnablePayload` rebuilds it from the
  authorization signature captured once at the session gate. The user still
  signs the authorization exactly once.

The only cost is one extra `enableSessionWithRefund` per commit, over mostly
warm slots.

### Read the mode byte first

`data[0]` of the validator signature tells you which path the failing intent
took:

| mode | constant | meaning |
|---|---|---|
| `0x01` | `FIXED_SESSION_MODE` | session only |
| `0x02` | `FIXED_SESSION_REFUND_MODE` | session + gas refund — assumes ALREADY enabled |
| `0x03` | `FIXED_SESSION_PERMIT2_MODE` | cross-chain, session only |
| `0x04` | `FIXED_SESSION_PERMIT2_ENABLE_MODE` | cross-chain first use, carries the proof |
| `0x05` | `FIXED_SESSION_REFUND_ENABLE_MODE` | same-chain first use, carries the proof |

`0x02` against a session that was never enabled is the `InvalidSigner()` row
above. The permissionId is `data[1:33]` of the same envelope, so check it
directly:

```bash
cast call <validator> 'isPermissionEnabled(address,bytes32)(bool)' <hca> <permissionId> \
  --block <details.blockNumber> --rpc-url "$ARCHIVE_RPC"
```

**`false` at the failing block and `true` at `latest` is the signature of this
bug**, and explains why it looks intermittent: some later run enables the
session, so every subsequent commit passes and only the first one under a fresh
session fails. A registration funded entirely from leftover HCA balance is the
usual trigger, because it needs no permit and so never took the funding branch.

### The SDK strips the proof once the session is enabled

Attaching `enableData` app-side is necessary but **not sufficient**. The exact
inverse of the bug above also exists, and it fails on the SECOND registration
rather than the first:

```js
// dist/src/execution/utils.js — resolveSignersForChain
const enabled = await isSessionEnabled(...)
const enableData = enabled ? undefined : resolved.enableData   // discards it
```

Registration 1 enables the session, so registration 2 sees `enabled === true`,
the SDK drops the proof the app correctly supplied, and
`packStandaloneHcaFixedSessionSignature` picks the mode purely from
`signers.enableData`:

| `enableData` | gas refund | mode |
|---|---|---|
| truthy | — | `0x05` (carries proof) |
| falsy | yes | `0x02` |
| falsy | no | `0x01` |

A funded commit then signs `0x01`/`0x02`, the validator takes the non-first-use
path, and `permit` is rejected — `ActionNotAllowed(USDC, 0xd505accf)` masked as
`InvalidSignature()`. The app-side guard in `submitFundingAndCommitActor`
cannot catch it: by then the proof has already been handed to the SDK.

Note the trap in our own patch — teaching `isSessionEnabled` about the
standalone-HCA validator (passing `config.account.validator`) makes it *more*
accurate, which is what starts returning `true` and triggers the strip. The
patch therefore also pins the line above to keep the proof for standalone HCA:

```js
const enableData = enabled && !isStandaloneHca(config) ? undefined : resolved.enableData
```

Symptom to recognise: first registration succeeds, every later one fails, and
`isPermissionEnabled` is `true` at the failing block (not `false`, as in §7).
Read the mode byte before anything else — `0x01`/`0x02` on a batch that also
contains `enableSessionWithRefund` means the call and the signature disagree.

## 8. `UnclassifiedRevert` is NOT a policy failure — read the batch's own state

```
Simulation failed: UnclassifiedRevert
  errorSelector: 0x00000000  category: UNCLASSIFIED_REVERT  retryable: false
```

Everything above this section is about `InvalidSignature()` (`0x8baa579f`), which
is the validator rejecting the intent. `UnclassifiedRevert` with a **zero
selector** is the opposite: the validator passed, execution began, and one of
the batched calls reverted with data the orchestrator could not classify. A
plain `Error(string)` from an ERC-20 lands here — `0x08c379a0` is not in its
table — so do not go looking for a policy bug.

Decode `simulations[].signedIntentOp.…destinationOps` and check each call
against **live chain state for that user** before anything else. The ops decode
straightforwardly:

| `to` | selector | call |
|---|---|---|
| USDC | `0xd505accf` | `permit(owner, spender, value, deadline, v, r, s)` |
| USDC | `0x23b872dd` | `transferFrom(wallet, HCA, value)` |
| validator | `0x4a9b6c49` | `enableSessionWithRefund(...)` |
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
