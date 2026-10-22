# Referrer preservation QA

Use this guide to verify [WEB-1911](https://linear.app/enslabs/issue/WEB-1911/preserve-referrer-through-registration-and-subname-creation-and) in Manager and Portal. Passing requires both correct URLs and decoded contract inputs. A successful transaction alone does not prove attribution was preserved.

## Start here

For one complete registration check, you need the **destination-chain reveal transaction hash**, its earlier **commitment transaction hash**, the registered name, and the registrar address. For a renewal, you need its destination-chain transaction hash, every renewed name, and the renewer address. Get transaction hashes from the transaction modal or explorer; an HCA intent ID, user-operation hash, source-chain funding hash, approval hash, and commitment hash are different identifiers.

Use the manual flow steps below, then run the [receipt helper](../scripts/referrer-qa.ts) for each resulting transaction. Keep each run's results in the checklist at the end. The helper makes read-only JSON-RPC requests; it needs no private key, wallet connection, or app `.env` file.

## Setup

Use a test deployment or the existing [local E2E environment](../README.md). For local time controls, follow [manual time travel](manual-time-travel.md). Record the tested commit, app URLs, network, wallet address, and account mode.

Prepare:

- A fresh, available `.eth` name with a label of at least three characters for each registration run. Replace `qa-referrer.eth` in the examples.
- A funded wallet with the network's gas token and a supported payment token. Use USDC for the Manager smart-account path.
- An owned, renewable V2 `.eth` name and an unmigrated renewable V1 `.eth` name.
- A parent that permits subname creation. Test a V2 parent with a deployed subregistry, plus V1 unwrapped and wrapped parents where available. Use a fresh child label each time.
- Browser developer tools with **Preserve log** enabled, and a block explorer or RPC tool that can decode contract calls and execution traces.

Run registration and renewal in these modes:

- Manager EOA: build/start with `VITE_FF_USE_EOA=true`.
- Manager smart account: leave that flag unset or false and confirm the flow actually uses a Rhinestone HCA. A connected external wallet alone does not identify the transaction path.
- Portal: its registration and renewal flows use EOA transactions.

Restart the dev server or rebuild when changing build-time flags. Keep Manager's registration resume enabled: `VITE_FF_REGISTRATION_RESUME` must not be `false`. Complete one registration at a time per wallet.

## Expected referrer values

Use this address-shaped value for the main runs:

```text
URL value:
0x1234567890123456789012345678901234567890

Expected bytes32 in contract calls:
0x0000000000000000000000001234567890123456789012345678901234567890
```

The URL keeps the supplied string. Contract inputs use lowercase hexadecimal, padded on the **left** to 32 bytes. Missing or invalid input becomes `bytes32(0)`; it does not block the flow.

Check these additional inputs with fresh flows:

- No `referrer` parameter: zero on-chain, with no referrer introduced into the URL.
- `referrer=0x1234`: 60 zero hex digits followed by `1234` on-chain.
- A full 32-byte value, including uppercase A–F: the same bytes, lowercase on-chain.
- Invalid values: `0x`, `1234`, `0xgg`, and `0x` followed by 65 hex digits. Each produces zero on-chain without crashing.

A single hex digit such as `0x1` is accepted and left-padded. Do not expect invalid strings to disappear from the URL: URL attribution context and calldata normalization are separate.

## Check what was recorded on chain

### Find the expected contract

The verifier requires an explicit contract address so an unrelated contract emitting a similarly named event cannot count as evidence. From the repository root, print the Sepolia addresses shipped in this checkout's ENS dependency:

```sh
pnpm --filter @ens-apps/e2e exec tsx -e "
import { ensL1Contracts } from '@ensdomains/ensjs/chain';
const contracts = ensL1Contracts[11155111];
console.log(JSON.stringify({
  v2Registrar: contracts.ensEthRegistrar.address,
  v1Renewer: contracts.ensEthRenewerV1.address,
}, null, 2));
"
```

Use `v2Registrar` for V2 registration and renewal, including the current Manager HCA path. Use `v1Renewer` for an unmigrated V1 renewal. Compare these with the tested deployment's manifest; a custom deployment or a build using different dependencies may use different addresses. For HCA transactions, the outer transaction's `to` is usually **not** the registrar/renewer.

### Set up the read-only verifier

Install workspace dependencies with the repository's normal setup first. Run commands below from the repository root in Bash. Enter your RPC endpoint privately in your own terminal; the helper does not load or print it.

```sh
read -rsp 'Destination-chain RPC URL: ' QA_RPC_URL
export QA_RPC_URL
printf '\n'

CHAIN_ID=11155111
REGISTRAR='0xReplaceWithV2RegistrarAddress'
RENEWER='0xReplaceWithTheRelevantV1OrV2RenewerAddress'
REVEAL_TX='0xReplaceWithRegistrationTransactionHash'
COMMIT_TX='0xReplaceWithCommitTransactionHash'
RENEW_TX='0xReplaceWithRenewalTransactionHash'
NAME='qa-referrer.eth'
REFERRER='0x1234'
```

Set `REFERRER` to the value used when the registration **started**, even if you later change the URL to test resume. Replace all example addresses and hashes before running a check.

### Verify a registration event

```sh
pnpm --filter @ens-apps/e2e exec tsx scripts/referrer-qa.ts \
  --chain-id "$CHAIN_ID" --contract "$REGISTRAR" \
  --tx "$REVEAL_TX" --kind registration \
  --names "$NAME" --referrer "$REFERRER"
```

The helper verifies the RPC network, a successful transaction receipt, and exactly one `NameRegistered` event for that exact label from the specified registrar. It compares the event's indexed `referrer` with the expected padded bytes32. This works for direct EOA and nested HCA registrations **without tracing**: the receipt contains logs from nested successful contract calls too.

Expected output ends with:

```text
Recorded event: qa-referrer.eth: 0x0000000000000000000000000000000000000000000000000000000000001234
PASS: all requested checks passed.
```

A successful outer HCA transaction with no matching registration event fails this check. So does an event for the wrong name, contract, or referrer.

### Verify the commitment as well

Add the earlier commit transaction hash:

```sh
pnpm --filter @ens-apps/e2e exec tsx scripts/referrer-qa.ts \
  --chain-id "$CHAIN_ID" --contract "$REGISTRAR" \
  --tx "$REVEAL_TX" --commit-tx "$COMMIT_TX" \
  --kind registration --names "$NAME" --referrer "$REFERRER"
```

In addition to checking the event, this decodes the reveal, matches its fields to the successful registration event, calls `makeCommitment` on the same registrar **at the reveal block**, and compares the result with a `CommitmentMade` event in the earlier successful commit receipt. The final output must include both `Commitment matches: 0x...` and `PASS`.

For direct EOA registration, ordinary transaction/receipt reads and historical `eth_call` are sufficient. For a nested HCA reveal, the helper also requests `debug_traceTransaction` with `callTracer` and extracts a successful `register` call to the specified registrar. It ignores reverted trace branches. The commit transaction itself does not need tracing because its `CommitmentMade` log identifies the submitted hash.

If your RPC cannot trace, the registration **event check still works**, but commitment reconstruction is **not verified**. Obtain a `callTracer` trace for the exact destination reveal hash from a trace-capable RPC or trusted debugger, save its JSON locally, and supply:

```sh
# Same registration command, with this additional option:
--trace-file /tmp/web-1911-reveal-call-trace.json
```

Accepted file shapes are the raw call tree or a JSON-RPC response containing that tree in `result`. An opcode-level `structLogs` trace, explorer HTML, or a trace of the funding transaction is not a substitute. Saving a trace does not bypass the need for a working RPC with the reveal block's historical state. Use the trace from the same transaction and network you pass to the helper.

### Verify single and batch renewals

```sh
# One renewal (V1 or V2; choose the correct RENEWER):
pnpm --filter @ens-apps/e2e exec tsx scripts/referrer-qa.ts \
  --chain-id "$CHAIN_ID" --contract "$RENEWER" \
  --tx "$RENEW_TX" --kind renewal \
  --names 'alice.eth' --referrer "$REFERRER"

# One transaction renewing multiple names:
pnpm --filter @ens-apps/e2e exec tsx scripts/referrer-qa.ts \
  --chain-id "$CHAIN_ID" --contract "$RENEWER" \
  --tx "$RENEW_TX" --kind renewal \
  --names 'alice.eth,bob.eth' --referrer "$REFERRER"
```

Every supplied name must have exactly one `NameRenewed` event from that renewer with the correct referrer. Missing names, extra renewal events, duplicate names, and a wrong referrer on just one entry all fail. This confirms recorded attribution even when the app uses a nested HCA `renewBatch` call. Also confirm each expiry increased in the app; the helper focuses on attribution.

Manager EOA bulk renewal and Portal multi-name renewal can produce **separate transactions per name**. Run the single-name command once per transaction. If an HCA batch is split into chunks, run the batch command once per chunk, listing only that chunk's names. A mixed V1/V2 Portal selection also targets different renewers; use each transaction's correct renewer address.

### Check zero attribution and interpret failures

Omit `--referrer` entirely to expect zero for a flow started without a query parameter. For invalid-input tests, pass the same invalid URL value, for example `--referrer '0xgg'`; the independently implemented verifier expects zero. It does not read the current browser URL or registration storage.

Exit code **0** means every requested check passed. Exit code **1** means failure **or inability to verify**. Never count a tracing error or missing receipt as a pass. The final `PASS` line is required; earlier `Recorded event` lines alone do not prove an optional commitment check succeeded.

Common failure causes:

- **Wrong chain ID:** use the destination network RPC. Local forks often retain Sepolia's chain ID; also confirm you selected the actual fork endpoint.
- **No receipt:** transaction is pending, the hash is not an on-chain transaction hash, or the RPC points at the wrong network.
- **No matching event:** wrong hash/address, an approval/funding transaction, a failed inner HCA call, or an incompatible deployed ABI.
- **Recorded referrer mismatch:** check the original run's referrer, particularly after resume. If the original input was nonzero and the event contains zero, this is the regression this change fixes.
- **Commitment mismatch:** wrong commit hash, wrong registrar/deployment, or inconsistent reveal inputs. Do not replace the expected referrer with the observed value to make the check pass.
- **RPC/trace/ABI decoding failure:** provider details are hidden to avoid exposing endpoint credentials. Check provider support and the installed ABI. These helpers use the checked-in dependency's V2 `NameRegistered`, `NameRenewed`, and `CommitmentMade` definitions. A deployment with different events requires its actual ABI and manual decoding; it is not covered by a successful check against another contract.

Use `--help` for the CLI options. The script never sends a transaction and never verifies subname attribution, because subname creation has no on-chain referrer argument.

### Explorer-only cross-check

Open the destination transaction's **Logs/Events** tab. Locate `NameRegistered` or `NameRenewed` emitted by the expected registrar/renewer, verify the decoded label, and compare `referrer` against the expected bytes32. In the current ABI, `referrer` is indexed: raw `topics[2]` contains it (`topics[0]` is the event signature; `topics[1]` is the token ID). For a batch, inspect every name's event.

This checks that attribution was **recorded in a successful event**, rather than merely present in proposed calldata or a simulation. Referrer is not an ENS text record; looking it up on the profile or checking a token approval does not verify it.

## Registration

Run the main case once in each account mode above.

1. Open the appropriate URL directly:

   ```text
   Manager: /register/qa-referrer.eth?referrer=0x1234567890123456789012345678901234567890
   Portal:  /register/?name=qa-referrer.eth&referrer=0x1234567890123456789012345678901234567890
   ```

2. Connect the wallet, choose a duration and payment token, and complete registration. Capture the commitment transaction and the final registration transaction or HCA execution.
3. Decode the registrar's `register` call. Its final argument, `referrer`, must equal the expected bytes32 above.
4. Verify the commitment as described below. Both commit and reveal must bind the same referrer.
5. Confirm the name belongs to the intended owner. Portal should redirect to the registered name's profile with the supplied referrer. Manager should retain it on the registration URL and when navigating to the profile.

### Verify the commitment correctly

The submitted `commit(bytes32)` transaction contains only a hash. It cannot directly show the referrer. Verify it using either the captured `makeCommitment` RPC call or a reconstruction from the reveal:

1. Decode `register(label, owner, secret, subregistry, resolver, duration, paymentToken, referrer)`.
2. On the **same registrar address and network**, call:

   ```text
   makeCommitment(label, owner, secret, subregistry, resolver, duration, referrer)
   ```

   Copy every argument from the decoded reveal; omit only `paymentToken`.
3. Compare the returned hash with the argument submitted to `commit`. They must match.
4. Separately assert that the reveal's referrer is the expected nonzero bytes32. A matching commitment made with zero would still be a failure.

For HCA transactions, inspect the nested registrar calls in the execution trace or decoded intent batch. The outer transaction may target an account or orchestrator rather than the registrar.

### Canonical redirects and ordinary navigation

- In Manager, open `/register/QA-REFERRER.ETH?referrer=0x1234` using a fresh available name. Expect the normalized registration URL, including `?referrer=0x1234`.
- Open an already-owned name through Manager's registration URL. Its profile redirect must retain the referrer.
- Navigate between a profile and renewal, and between Portal's parent Subnames page and creation form. Browser back/forward should retain the referrer associated with each history entry.
- Repeat navigation from a fresh URL with no referrer. It must not acquire attribution from an earlier completed run.

## Interrupted registration and retry

Run these checks for Manager EOA, Manager HCA, and Portal EOA. Start each independent case with a fresh name.

1. Start registration with `referrer=0x1234` and let the commitment land.
2. During the commitment cooldown, reload the page. Reconnect the same wallet if required and resume the existing run.
3. Complete registration. Expect no second paid commitment for this still-valid run. Decode the reveal and reconstruct its commitment: both must use the original padded `0x1234`.
4. In a separate run, after the commitment lands, change the URL to `referrer=0xabcd` and reload. Resume and finish. The reveal must still use the **stored original `0x1234`**, because changing attribution would invalidate the commitment.
5. Repeat with the query parameter removed before reloading. The stored original value must still be used on-chain.
6. In another run, reject the final registration prompt before submission, then retry. The retry must use the original referrer and commitment.

Inspect persisted state during the interrupted run if needed:

- Manager localStorage key: `ens-apps:register-v2:resume:v1`. Parse its outer JSON, then parse the `record` JSON string to inspect `context.referrer`. The outer envelope also has `confirmedData.referrer`.
- Portal localStorage key: `ens-apps:portal:register:resume:v1`; referrer at `context.referrer`.

In the app's browser DevTools console, this read-only inspector prints only the attribution fields; it does not print the commitment secret or wallet data:

```js
(() => {
  const app = 'manager' // Change to 'portal' when testing Portal.
  const key = app === 'manager'
    ? 'ens-apps:register-v2:resume:v1'
    : 'ens-apps:portal:register:resume:v1'
  const raw = localStorage.getItem(key)
  const stored = raw ? JSON.parse(raw) : undefined
  const run = app === 'manager' && stored ? JSON.parse(stored.record) : stored
  return {
    name: run?.context?.name,
    stage: run?.stage,
    storedReferrer: run?.context?.referrer,
    confirmedReferrer: app === 'manager' ? stored?.confirmedData?.referrer : undefined,
    urlReferrer: new URL(location.href).searchParams.get('referrer'),
  }
})()
```

Do not clear or edit the stored record during a resume test. The URL can contain a new value while an existing run correctly uses its original stored value. Do not treat that difference alone as a failure.

Also run a fresh registration without a referrer after completing an attributed run. Its calldata must return to zero.

## Subname creation in Portal

Repeat for V2 and the available V1 parent types. Manager has no equivalent subname creation form in this change.

1. Open:

   ```text
   /parent.eth/subnames?referrer=0x1234567890123456789012345678901234567890
   ```

2. Select **Create subname**. Expect:

   ```text
   /parent.eth/create-subname?referrer=0x1234567890123456789012345678901234567890
   ```

3. Enter a fresh label, such as `qa-child`, choose an owner, and complete creation.
4. Dismiss/complete the transaction modal. Expect the **child's profile**:

   ```text
   /qa-child.parent.eth?referrer=0x1234567890123456789012345678901234567890
   ```

5. Confirm the child exists and belongs to the selected owner. Decode the creation call with the deployed contract ABI: its normal arguments must remain valid, with no added referrer argument or trailing referrer payload.
6. Repeat without a referrer. The same child-profile redirect should work without adding a referrer parameter.

Returning to `/parent.eth/subnames` after successful creation is a failure, even if that URL retains the referrer.

## Renewal

Check both V2 and unmigrated V1 names where the environment supports them.

1. Open Manager's `/renew/<name>?referrer=0x1234` for V2 or `/renew-v1/<name>?referrer=0x1234` for V1. If the V2 route redirects a V1 name, the referrer must survive.
2. In Portal, open the name's profile with `?referrer=0x1234`, then use its extension action.
3. Complete a renewal in each supported account mode. Confirm expiry increases and decode the nested or direct renewal call.
4. For `renew`, check `RenewData.referrer`. For `renewBatch`, check **every entry's** referrer. Each must be padded `0x1234`.
5. Repeat Manager's bulk renewal with at least two V2 names, on EOA and HCA paths. Portal's multi-name renewal should also carry the referrer to every name's renewal, including a mixed V1/V2 selection if available.
6. Check a missing referrer and an invalid referrer on fresh renewal flows. Both must encode zero and still renew successfully.

Check the calldata actually submitted, not just a gas estimate or approval. ERC-20 `approve` and permit calls do not carry this attribution.

## Coverage checklist

Use a fresh name for each independent registration case. Record each item as **pass**, **fail**, or **not run**, with a reason. A route-only check does not complete an on-chain item.

- [ ] Manager EOA registration: nonzero registration event and matching commitment.
- [ ] Manager HCA registration: nonzero registration event and matching nested reveal/commitment.
- [ ] Portal EOA registration: nonzero registration event and matching commitment.
- [ ] For each registration mode: cooldown reload, changed URL, removed URL parameter, and rejected-prompt retry keep the original committed referrer. Re-run the helper with that original value after each completed reveal.
- [ ] Fresh no-referrer registration after an attributed run records zero.
- [ ] Short hex, full bytes32, uppercase hex, and invalid/oversized input follow the normalization rules. Check recorded events, not only URL rendering.
- [ ] Manager EOA and HCA single V2 renewal: matching event and increased expiry.
- [ ] Manager EOA and HCA single V1 renewal, where supported: matching event and increased expiry.
- [ ] Manager EOA bulk renewal: check each name's transaction separately.
- [ ] Manager HCA bulk renewal: check every name in each intent chunk.
- [ ] Portal single V1/V2 renewal and multi-name V1/V2 selection: check each transaction against its actual renewer.
- [ ] Renewal without a referrer and with invalid input records zero.
- [ ] Portal V2, V1 unwrapped, and V1 wrapped subname creation: parent-to-form URL retains referrer; completion opens the child profile with it; owner is correct; creation calldata has no added attribution argument.
- [ ] Subname creation without a referrer does not introduce one.
- [ ] Manager canonical-name, owned-name, renewal-to-registration, and short-name profile redirects preserve referrer. Ordinary navigation and browser back/forward preserve each entry's context.
- [ ] Directly loading a fresh URL without referrer does not inherit earlier attribution.

Browser checks already performed on this branch covered unauthenticated navigation, registration-page loading, Manager redirects, no-referrer isolation, and execution of five normalization cases in the browser. They did **not** complete signed registrations, renewals, transaction resume, or the subname success redirect. The helper's automated tests use synthetic receipts and mocked RPC responses; live receipt checks still need the transaction hashes from your runs.

## Evidence and acceptance

For each main run, record the app/account mode, network, test name, starting URL, final URL, transaction hashes, decoded referrer, and pass/fail result. For registration, also record the submitted commitment hash and the reconstructed hash.

Copy this block for each checklist item:

```text
Case and result (PASS / FAIL / NOT RUN):
Build commit and deployment URL:
App and account mode (Manager EOA / Manager HCA / Portal EOA):
Network chain ID and expected registrar/renewer:
Name(s), original URL referrer, expected bytes32:
Starting URL and final URL:
Destination transaction hash(es):
Commit transaction hash (registration):
Receipt-helper output, including final PASS or failure:
Commitment matches output (registration):
Expiry before and after (renewal), owner (registration/subname):
Missing prerequisite or failure details:
```

Mark unavailable V1, HCA, or batch coverage as **not run**, with the missing prerequisite. Do not count it as passing. Acceptance requires nonzero attribution on both registration legs, preservation across resume/retry, attribution on every renewed name, and the child-profile redirect after subname creation.

## Automated regression checks

Run from the repository root:

```sh
# Read-only verifier tests (synthetic events and mocked RPC; no wallet required):
pnpm --filter @ens-apps/e2e exec tsx --test scripts/referrer-qa.test.ts
pnpm --filter @ens-apps/e2e typecheck

pnpm --filter manager typecheck
pnpm --filter portal typecheck

pnpm --filter @ens-apps/transaction-manager test src/machines/registration/registration.referrer.test.ts src/machines/registration/registration.machine.test.ts src/machines/registration/registration.persistence.test.ts src/machines/registration/registration.hca.actors.test.ts src/machines/registration/registration.renew.actors.test.ts
pnpm --filter @ens-apps/smart-account test src/providers/rhinestone/registration-calls.test.ts

pnpm --filter manager test src/routes/referrer.test.ts src/features/register-v2/state/registrationUi.machine.test.ts src/features/register-v2/service/registrationPersistence.test.ts src/features/register-v2/workflow/pricing/components/TokenPickerContent.test.tsx src/features/register-v2/workflow/pricing/components/TokenPickerContent.budget.test.tsx src/features/renew/state/renewalUi.machine.test.ts src/features/renew/service/hcaRenewal.test.ts src/features/bulk-renew/hooks/useBulkRenewSubmit.test.ts
pnpm --filter portal test src/routes/referrer.test.ts src/routes/register/index.test.tsx 'src/routes/$name/create-subname.test.tsx' 'src/routes/$name/subnames.test.tsx' src/features/register/hooks/useRegistrationTransactions.test.tsx src/features/renew/hooks/useRenewalTransactions.test.ts src/features/renew/utils/buildRenewIntent.test.ts
```

These cover normalization, calldata builders, state propagation, persistence, router behavior, and completion navigation. Manual runs additionally verify wallet signing, deployed contract compatibility, and HCA execution in the target environment.
