# WEB-446 — Transfer ownership (V2 names): QA test plan

PR: [#926 Ability to Transfer Ownership V2 names](https://github.com/ensdomains/apps-monorepo/pull/926)
App: **portal** (`apps/portal`, `http://localhost:3001`) — not the manager.
Spec: `e2e/projects/portal/tests/transfer.spec.ts`

---

## 1. Change surface (what a user can actually observe)

| Area | Behaviour |
|---|---|
| `/$name/ownership` | "Transfer" button, shown only when connected wallet is the v2 owner **and** holds `ROLE_CAN_TRANSFER_ADMIN` |
| `/$name/ownership/transfer` | Route guards: not-v2 → "Transfer not available"; disconnected → "Connect your wallet"; non-owner → "Not authorized"; owner without transfer role → "Transfer not available" (role copy); role lookup error → "Couldn't check transfer permission" |
| `SendNameForm` | Irreversibility warning, recipient input (address or ENS name), live recipient preview (avatar + primary name), self / zero-address rejection |
| Detach options | 3 switches, each rendered **only when it has a target**, each defaulting **on**: `setEthAddress`, `detachResolver`, `detachRegistry`. `setEthAddress` is disabled while `detachResolver` is on. Turning one off shows a per-option warning alert. |
| Transaction plan | `buildTransferPlan` → ordered steps, config first, `transfer-token` always last |
| After completion | Redirect to `/$name/ownership`, owner query invalidated, indexer polled |

### Plan arithmetic (`buildTransferPlan`) — the oracle for step count

`set-eth-addr` is emitted only when `setEthAddress && !detachResolver`.

| setEthAddress | detachResolver | detachRegistry | Steps |
|---|---|---|---|
| ✓ | ✓ | ✓ | detach-resolver, detach-registry, transfer-token (**3**) |
| ✓ | ✗ | ✓ | set-eth-addr, detach-registry, transfer-token (**3**) |
| ✓ | ✗ | ✗ | set-eth-addr, transfer-token (**2**) |
| ✗ | ✓ | ✗ | detach-resolver, transfer-token (**2**) |
| ✗ | ✗ | ✗ | transfer-token (**1**) |

Transaction ids are `transfer-<name>-<step>`, so the console oracle is exact.

---

## 2. On-chain ground truth for **migrated V1 → V2** names

Measured, not assumed — `e2e/scripts/probe-migrated.ts` registers a V1 name of each
token type, migrates it through the real `MigrationHelper.migrate`, and reads back v2 state.
`e2e/scripts/probe-detach.ts` then simulates each transfer-plan call as the owner.

| V1 type | v2 owner | v2 resolver | v2 subregistry | `CAN_TRANSFER_ADMIN` | `SET_RESOLVER` | `SET_SUBREGISTRY` |
|---|---|---|---|---|---|---|
| unwrapped | EOA ✓ | PublicResolver `0x5239…` | `0x0` | ✅ | ✅ | ✅ |
| wrapped (unlocked) | EOA ✓ | PublicResolver `0x5239…` | `0x0` | ✅ | ✅ | ✅ |
| **locked** (CANNOT_UNWRAP) | EOA ✓ | PublicResolver `0x5239…` | **`0xBF48…` (non-zero)** | ✅ | ✅ | ❌ **false** |

Simulated plan steps as the owner:

```
unwrapped:  setResolver(0)  ✅   setSubregistry(0)  ✅   safeTransferFrom  ✅
locked:     setResolver(0)  ✅   setSubregistry(0)  ❌ REVERTS   safeTransferFrom  ✅
```

**Consequence (see finding F1).** All migrated names arrive with a resolver, so
`detachResolver` is always visible and on. A migrated **locked** name additionally
arrives with a non-zero subregistry, so `detachRegistry` is also visible and on — but the
owner cannot execute it. The plan runs `detach-resolver` (succeeds, irreversible) →
`detach-registry` (reverts) → `transfer-token` never runs.

---

## 3. Scenarios

Legend: **O** = oracle (the exact rule that decides pass/fail).

### A. Native V2 names — happy paths

| # | Scenario | O |
|---|---|---|
| A1 | Transfer to a raw address from the Ownership tab | 2 txs (`detach-resolver`, `transfer-token`); URL returns to `/$name/ownership`; recipient shown as Owner on `/$name` and `/$name/ownership` |
| A2 | Transfer to an ENS name | recipient preview resolves to wallet B's address before submit; same 2 txs; owner flips |
| A3 | Both detach toggles off | exactly **1** tx (`transfer-token`); `getResolver`/`getSubregistry` read back **byte-identical** to their pre-transfer values |
| A4 | Subname — **not offered** (see F4) | no Transfer link on `/sub.parent.eth/ownership`; the route shows "Transfer not available / Transferring subnames isn't supported yet"; parent (a 2LD) still transferable |
| A5 | New owner can operate the name afterwards | new owner deploys a resolver and writes a text record successfully |

### B. Migrated V1 → V2 names  ← the PR's stated scope gap

| # | Scenario | O |
|---|---|---|
| B1 | Migrated **unwrapped** name, default toggles | `detachResolver` visible+on, `detachRegistry` **hidden** (subregistry is `0x0`); 2 txs; owner flips |
| B2 | Migrated **unlocked/wrapped** name | same as B1 |
| B3 | Migrated **locked** name, default toggles | **Expected-by-design:** the flow completes. **Actual:** `detach-registry` reverts → see F1 |
| B4 | Migrated **locked** name, `detachRegistry` turned OFF | 2 txs (`detach-resolver`, `transfer-token`); owner flips; subregistry unchanged — the workaround path |
| B5 | Migrated name with a V1 ETH address record, `detachResolver` OFF | `setEthAddress` switch becomes enabled and visible; 3 txs incl. `set-eth-addr`; `addr(60)` reads back as the **recipient** |
| B6 | Transfer button visibility on a migrated name's Ownership tab | shown (all three types hold `CAN_TRANSFER_ADMIN`) |

### C. Guards & validation

| # | Scenario | O |
|---|---|---|
| C1 | Recipient = own address | "The recipient already owns this name."; button disabled |
| C2 | Recipient = own ENS name | same |
| C3 | Recipient = `0x0000…0000` | "Can't transfer to the zero address."; button disabled |
| C4 | `notaname` (no TLD) | "Enter a valid ENS name or address"; button disabled |
| C5 | `0x1234` (short hex) | same as C4 |
| C6 | Unregistered `.eth` | "Could not resolve an address for "…""; button disabled |
| C7 | Whitespace-padded valid address | trims and resolves; button **enabled** |
| C8 | Non-owner visits `/$name/ownership/transfer` | "Not authorized" card; no form |
| C9 | Disconnected wallet visits the route | "Connect your wallet" card |
| C10 | V1 (unmigrated) name visits the route | "Transfer not available — only for ENSv2 names" |
| C11 | Ownership tab hides "Transfer" for a non-owner | no Transfer link in the DOM |

### D. Option-visibility matrix (`useTransferDetachTargets`)

| # | State | O |
|---|---|---|
| D1 | No resolver, no subregistry, no ETH addr | zero switches rendered; 1 tx |
| D2 | Resolver set only | only `detachResolver` rendered |
| D3 | Resolver + subregistry | `detachResolver` + `detachRegistry`; `setEthAddress` hidden unless `addr(60)` set |
| D4 | `detachResolver` ON | `setEthAddress` switch is **disabled** and reads "Not needed while the resolver is being detached." |
| D5 | `detachResolver` toggled OFF while `setEthAddress` was on | `setEthAddress` re-enables and contributes `set-eth-addr` to the plan |
| D6 | Any toggle turned off | its warning `Alert` appears |

### E. Regression (shared code)

| # | Scenario | O |
|---|---|---|
| E1 | `AddressNameInput` in the roles/registry/resolver "Add user" sheets | still resolves names and addresses, same status messages |
| E2 | `/$name/ownership` for a V1 name | still renders expiry/owner/manager rows + grace banner |
| E3 | Records/edit-records pages after `useCanEditRecords` refactor | unchanged behaviour for an owner |
| E4 | `buildTransferPlan` unit tests | `pnpm --filter portal test` green |

---

## 4. Findings

### F1 — High — ✅ **FIXED** (verified on `dab56ec16`)

Fixed upstream by `f524d71b3` / `dab56ec16`. `useTransferDetachTargets` now requires
the matching role as well as a target:

```ts
detachRegistry: … hasSubregistry && rolesQuery.isSuccess &&
                heldRoles.includes('ROLE_SET_SUBREGISTRY'),
detachResolver: … hasResolver    && rolesQuery.isSuccess &&
                heldRoles.includes('ROLE_SET_RESOLVER'),
```

`settled` now also waits on the roles query and `failed` includes its error, so the
form can't start while permissions are unknown.

**Re-verified after rebasing onto the fix.** The on-chain precondition is unchanged —
a migrated locked name still gets a non-zero subregistry and still lacks
`ROLE_SET_SUBREGISTRY` — but the UI no longer offers the impossible option, so the
default plan is the two steps the owner can actually perform. Read back independently
after the run:

```
owner       0x7099…9C8   ← transferred
resolver    0x0          ← detached as intended
subregistry 0x4AC7…987E  ← preserved, untouched
```

Covered by the passing test `transfers a migrated locked V1 name with the default
options, without offering the registry detach it cannot perform`, which asserts the
on-chain preconditions directly so it fails if either the role behaviour or the gating
regresses.

The original report follows, for history.

#### Original report — a migrated **locked** V1 name cannot be transferred with the default options, and loses its resolver trying

**Reproduced end-to-end in the real UI** (`explore-locked-run`, then confirmed on-chain).

A V1 name that was locked (`CANNOT_UNWRAP`) migrates into v2 with a **non-zero
subregistry**, so `useTransferDetachTargets` shows *Detach the registry* and
`SendNameForm` defaults it **on**. But the migration does **not** grant the owner
`ROLE_SET_SUBREGISTRY`, so the resulting `detach-registry` step reverts with
`EACUnauthorizedAccountRoles(resource, 0x100000, owner)` — `0x100000` is
`ROLE_SET_SUBREGISTRY` (`1n << 20n`).

Because `buildTransferPlan` deliberately runs config steps **before** the token moves,
the observed outcome is the worst ordering:

| Step | Result |
|---|---|
| `detach-resolver` | ✅ succeeds — **irreversible** |
| `detach-registry` | ❌ reverts (see presentation note) |
| `transfer-token` | never runs |

**Presentation is wallet-dependent.** With the e2e headless provider the flow stalls
at gas estimation and the modal sits on **"Waiting…"** indefinitely with no error. With
MetaMask the transaction is submitted and reverts on-chain (receipt `status: 0x0`,
~35k gas), and the modal shows a raw **"Transaction Error — … reverted"** with a stack
trace. Neither explains *why* it failed or that the resolver is already gone. Confirmed
on `dev2216.eth`, a locked name migrated through the dev panel:
`EACUnauthorizedAccountRoles(resource=0x121eac6e…, roleBitmap=0x100000, 0xf39F…2266)`.

End state, read off-chain after the run: `resolver = 0x0`, subregistry unchanged, owner
unchanged. The user has destroyed their resolver and still holds the name — precisely
the trap `useCanTransferName`'s own doc-comment says the guard exists to prevent. The
guard only mirrors `ROLE_CAN_TRANSFER_ADMIN`, which *is* granted, so nothing catches it.

Suggested fix: gate each detach option on the matching role
(`ROLE_SET_SUBREGISTRY` / `ROLE_SET_RESOLVER`), not merely on having a target — hide or
disable the option when the role is absent. Separately, a reverting step should surface
an error rather than hang on "Waiting…".

Coverage: `test.fixme('transfers a migrated locked V1 name with the default options')`
documents the intended behaviour and flips green when fixed. The workaround path is
covered by a passing test.

### F2 — Medium (test infra) — the transfer spec could not run end-to-end

`attachSubregistry` let ensjs pick its default salt. `deploySubregistry` computes
`DEFAULT_SALT` **once at module load** (`keccak256(new Date().toISOString())`), so both
tests that call it within one Playwright worker reused the same salt; since the CREATE2
address is a function of (deployer, salt), the second deploy reverted on an
already-deployed proxy. Individually-filtered runs passed, so it was invisible until the
whole file ran. Fixed by deriving a per-name salt.

### F3 — Low (test infra) — `fixtures/makeV1Name.ts` points at a stale V2 deployment

It hardcodes `V2_ETH_REGISTRY = 0x796fff…` and `V2_ETH_REGISTRAR = 0x68586418…`, while
the apps and `packages/dev-migration-tool` both use the ensjs chain config
(`0xDEDB92…` / `0x8c2E86…`). `reserveInV2` therefore writes to the wrong registry, which
would break the manager migration specs. Not fixed here (out of this PR's scope —
manager tests); `makeMigratedName.ts` deliberately sources every address from ensjs
instead. Worth a separate ticket.

### F4 — Note — subnames are gated client-side only

Commit `2be99824b` disables subname transfers: both
[`ownership/index.tsx`](../../apps/portal/src/routes/$name/ownership/index.tsx)
(`canTransfer = … && !isSubname`) and
[`ownership/transfer.tsx`](../../apps/portal/src/routes/$name/ownership/transfer.tsx)
gate on `is2LD(name)`, which is false for anything deeper than `label.eth`.

This is a **UI deferral, not an on-chain restriction**. An earlier revision of the
subname test transferred `sub.parent.eth` end-to-end successfully — the owner holds
`ROLE_CAN_TRANSFER_ADMIN` on the subname's token and can still call `safeTransferFrom`
directly. Worth confirming with the PR author whether that is the intent.

The suite now asserts the gate rather than the transfer (`does not offer transfer for a
subname`), and also checks the parent 2LD remains transferable so the guard isn't
over-broad.

### Non-findings (verified working)

- Native V2 transfers to an address and to an ENS name.
- Both detach toggles off → single-step plan; resolver and subregistry byte-identical after.
- `set-eth-addr` path: option appears only with `addr(60)` set, is disabled while the
  resolver detach is on, and repoints `addr(60)` to the recipient when enabled.
- All guard cards: not-owner, disconnected, self-recipient, zero address, malformed
  input, unresolvable name. Whitespace is trimmed rather than rejected.
- Migrated unwrapped and unlocked names transfer cleanly with defaults.

---

## 5. Environment

- portal dev server `:3001` (`pnpm --filter portal dev`)
- Anvil fork `:8545`, panoptes indexer `:5655`, alto `:4337`, paymaster `:3002` (`pnpm e2e:infra:up`)
- Wallet: `@ensdomains/headless-web3-provider` injected by `fixtures/playwright.portal.fixture.ts`
  — accounts `user` … `user4` from the Anvil mnemonic
