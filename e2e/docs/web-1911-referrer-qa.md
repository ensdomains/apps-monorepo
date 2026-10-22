# Referrer preservation QA

Use this guide to verify [WEB-1911](https://linear.app/enslabs/issue/WEB-1911/preserve-referrer-through-registration-and-subname-creation-and) in Manager and Portal. Passing requires both correct URLs and decoded contract inputs. A successful transaction alone does not prove attribution was preserved.

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

## Evidence and acceptance

For each main run, record the app/account mode, network, test name, starting URL, final URL, transaction hashes, decoded referrer, and pass/fail result. For registration, also record the submitted commitment hash and the reconstructed hash.

Mark unavailable V1, HCA, or batch coverage as **not run**, with the missing prerequisite. Do not count it as passing. Acceptance requires nonzero attribution on both registration legs, preservation across resume/retry, attribution on every renewed name, and the child-profile redirect after subname creation.

## Automated regression checks

Run from the repository root:

```sh
pnpm --filter manager typecheck
pnpm --filter portal typecheck

pnpm --filter @ens-apps/transaction-manager test src/machines/registration/registration.referrer.test.ts src/machines/registration/registration.machine.test.ts src/machines/registration/registration.persistence.test.ts src/machines/registration/registration.hca.actors.test.ts src/machines/registration/registration.renew.actors.test.ts
pnpm --filter @ens-apps/smart-account test src/providers/rhinestone/registration-calls.test.ts

pnpm --filter manager test src/routes/referrer.test.ts src/features/register-v2/state/registrationUi.machine.test.ts src/features/register-v2/service/registrationPersistence.test.ts src/features/register-v2/workflow/pricing/components/TokenPickerContent.test.tsx src/features/register-v2/workflow/pricing/components/TokenPickerContent.budget.test.tsx src/features/renew/state/renewalUi.machine.test.ts src/features/renew/service/hcaRenewal.test.ts src/features/bulk-renew/hooks/useBulkRenewSubmit.test.ts
pnpm --filter portal test src/routes/referrer.test.ts src/routes/register/index.test.tsx 'src/routes/$name/create-subname.test.tsx' 'src/routes/$name/subnames.test.tsx' src/features/register/hooks/useRegistrationTransactions.test.tsx src/features/renew/hooks/useRenewalTransactions.test.ts src/features/renew/utils/buildRenewIntent.test.ts
```

These cover normalization, calldata builders, state propagation, persistence, router behavior, and completion navigation. Manual runs additionally verify wallet signing, deployed contract compatibility, and HCA execution in the target environment.
