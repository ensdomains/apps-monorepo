# V1 → V2 Wrapped-Name Migration: Fuse Test Plan

Scope: how every NameWrapper fuse — individually and in combination — is translated
into ENSv2 registry state during migration, and what the manager app must do about it.

Sources cross-referenced:

- `ens-contracts/contracts/wrapper/INameWrapper.sol` (fuse definitions, V1 semantics)
- `contracts-v2/contracts/src/migration/` (`LibMigration`, `AbstractWrapperReceiver`,
  `LockedWrapperReceiver`, `LockedMigrationController`, `UnlockedMigrationController`)
- `contracts-v2/contracts/src/registry/WrapperRegistry.sol` (root-role virtual owner)
- `contracts-v2/contracts/src/registry/libraries/RegistryRolesLib.sol` (nybble-packed roles)
- `packages/migration/src/service/classifyNames.ts` + `preflightChecks.ts` (app classification)
- `apps/manager/src/features/migration/service/buildAtomicMigrationBatches.ts` (app role mirror)

---

## 1. The V1 fuse surface

Owner-controlled fuses (`uint16`, bits 0–6 — settable via `wrapETH2LD` / `setFuses`):

| Fuse | Value | V1 meaning |
|---|---|---|
| `CANNOT_UNWRAP` | `0x01` | name is *locked*; cannot leave the wrapper |
| `CANNOT_BURN_FUSES` | `0x02` | fuse set is *frozen*; no further burns |
| `CANNOT_TRANSFER` | `0x04` | ERC-1155 transfer is prohibited |
| `CANNOT_SET_RESOLVER` | `0x08` | resolver address is pinned |
| `CANNOT_SET_TTL` | `0x10` | TTL is pinned |
| `CANNOT_CREATE_SUBDOMAIN` | `0x20` | no new subnames |
| `CANNOT_APPROVE` | `0x40` | per-token approval is pinned |

Parent-controlled fuses (bits 16–18 — **not** settable through `wrapETH2LD`'s `uint16` arg):

| Fuse | Value | V1 meaning |
|---|---|---|
| `PARENT_CANNOT_CONTROL` | `1 << 16` | child is *emancipated* from its parent |
| `IS_DOT_ETH` | `1 << 17` | set by the wrapper on `.eth` 2LDs only |
| `CAN_EXTEND_EXPIRY` | `1 << 18` | child may extend its own expiry |

Invariants inherited from V1 that bound the test matrix:

- Owner fuses can only be burned once `PARENT_CANNOT_CONTROL` is set.
- `CANNOT_UNWRAP` therefore implies `PARENT_CANNOT_CONTROL`
  (`LibMigration.isLocked` relies on exactly this — it only tests `CANNOT_UNWRAP`).
- A wrapped `.eth` 2LD always carries `PARENT_CANNOT_CONTROL | IS_DOT_ETH`.
- `CAN_EXTEND_EXPIRY` is set by the *parent*, so on a 2LD it is unreachable in practice
  (the parent of a 2LD is the `.eth` node, controlled by the registrar).

## 2. Routing: which controller receives the token

`LibMigration` classifies purely from the fuse word:

```
isLocked(f)            = f & CANNOT_UNWRAP != 0
notFrozen(f)           = f & CANNOT_BURN_FUSES == 0
isEmancipatedChild(f)  = f & (IS_DOT_ETH | PARENT_CANNOT_CONTROL) == PARENT_CANNOT_CONTROL
```

| V1 token state | Route | V2 result |
|---|---|---|
| Unwrapped (ERC-721) | `UnlockedMigrationController.onERC721Received` | `ETHRegistry.register` with `REGISTRATION_ROLE_BITMAP` |
| Wrapped 2LD, `!CANNOT_UNWRAP` | `UnlockedMigrationController` (ERC-1155) | `unwrapETH2LD` → graveyard, then `REGISTRATION_ROLE_BITMAP` |
| Wrapped 2LD, `CANNOT_UNWRAP` | `LockedMigrationController` | `WrapperRegistry` proxy + fuse-derived roles |
| Wrapped subname, `CANNOT_UNWRAP` | parent's `WrapperRegistry` | `WrapperRegistry` proxy + fuse-derived roles |
| Wrapped subname, `PCC` & `!CANNOT_UNWRAP` | parent's `WrapperRegistry`, emancipated branch | `REGISTRATION_ROLE_BITMAP` (+ renew if `CAN_EXTEND_EXPIRY`) |
| Wrapped subname, `!PCC` | **not migratable** | app: `unlocked-subname` |

## 3. The fuse → role mapping under test

Roles are nybble-packed (`RegistryRolesLib`); the admin of a role sits 128 bits higher.

**Token roles** — `LockedWrapperReceiver._tokenRoleBitmapFromFuses`:

```
b  = (CAN_EXTEND_EXPIRY   ? ROLE_RENEW        : 0)
   | (CANNOT_SET_RESOLVER ? 0 : ROLE_SET_RESOLVER)
if notFrozen(f): b |= b << 128            // grant admin of what we just granted
if !CANNOT_TRANSFER:  b |= ROLE_CAN_TRANSFER_ADMIN
```

Two orderings matter and are easy to regress:

- `ROLE_CAN_TRANSFER_ADMIN` is OR-ed **after** the shift, so it never gains an
  "admin of admin" bit and is granted regardless of `CANNOT_BURN_FUSES`.
- A frozen name (`CANNOT_BURN_FUSES`) gets **no admin roles** for renew/resolver —
  the V1 "you may never change this again" guarantee is carried into V2 as
  "you may never re-grant this role".

**Subregistry root roles** — `LockedWrapperReceiver._subregistryRoleBitmapFromFuses`:

```
b  = ROLE_RENEW | ROLE_UPGRADE | ROLE_CAN_NAME
   | (CANNOT_CREATE_SUBDOMAIN ? 0 : ROLE_REGISTRAR)
if notFrozen(f): b |= b << 128
```

`WrapperRegistry` stores these against a *virtual owner* (the parent registry address) and
`_getRoles(ROOT_RESOURCE, account)` remaps the current token owner onto it — so root roles
follow the token on transfer. Assertions must read
`wrapperRegistry.roles(ROOT_RESOURCE, <current owner>)`.

**Resolver handling**:

- `!CANNOT_SET_RESOLVER` → V1 resolver is cleared; V2 resolver is whatever the app supplies.
- `CANNOT_SET_RESOLVER` → the V1 registry resolver is carried across, and swapped for the new
  `PublicResolver` if it is a member of `PUBLIC_RESOLVER_SET`.

**Fuses with no V2 analogue**:

- `CANNOT_SET_TTL` — V2 has no TTL; the restriction is silently dropped. Expected loss.
- `CANNOT_APPROVE` — not represented as a role; it only acts as a *precondition*
  (see below).

**Blocking conditions**:

| Condition | Contract behaviour | App behaviour |
|---|---|---|
| `CANNOT_TRANSFER` burned | `safeTransferFrom` reverts `OperationProhibited` — the token can never reach the controller | classify as ineligible `not-transferable` |
| `CANNOT_APPROVE` burned **and** `getApproved != 0` | `FrozenTokenApproval` revert | preflight `checkFrozenApproval` → ineligible `frozen-approval` |
| Locked child whose parent is not migrated | no `WrapperRegistry` receiver exists | must migrate parent first (batch ordering) |

`CANNOT_TRANSFER` is the sharp edge: it makes a name **permanently unmigratable**. The
plan treats "app never offers such a name for migration, and says why" as a
first-class requirement, not an edge case.

## 4. Test matrix

Let `F` be an owner-controlled fuse combination. The full space is 2^7 = 128 combinations;
migration only concerns those with `CANNOT_UNWRAP` set (64), of which those with
`CANNOT_TRANSFER` set (32) must revert and the remaining 32 must migrate.

### Tier A — contract level (Foundry, exhaustive)

`contracts-v2/contracts/test/unit/migration/LockedMigrationFuseMatrix.t.sol`

- **A1** For all 32 migratable combinations: migrate, then assert the token role bitmap is
  *exactly* the reference mapping, and the `WrapperRegistry` root bitmap is *exactly* the
  reference mapping. Exact equality (not "has role") is the point — an over-grant is as
  much a bug as an under-grant.
- **A2** For all 32 `CANNOT_TRANSFER` combinations: assert `safeTransferFrom` reverts
  `OperationProhibited`.
- **A3** `CANNOT_APPROVE` + outstanding approval → `FrozenTokenApproval`;
  `CANNOT_APPROVE` + no approval → migrates.
- **A4** `CANNOT_SET_TTL` alone changes nothing in the produced bitmaps (documents the drop).
- **A5** Frozen (`CANNOT_BURN_FUSES`) names get zero admin bits on both resources, and
  `ROLE_CAN_TRANSFER_ADMIN` is still present.
- **A6** Emancipated child (`PCC`, no `CANNOT_UNWRAP`): `REGISTRATION_ROLE_BITMAP`, plus
  `ROLE_RENEW|ROLE_RENEW_ADMIN` iff `CAN_EXTEND_EXPIRY`.

### Tier B — app parity (Vitest)

`apps/manager/src/features/migration/service/fuseRoleParity.test.ts`

The app re-implements the mapping in TypeScript to build verification expectations. Any drift
between `lockedNameOwnerRoleBitmap` / `lockedWrapperRootRoleBitmap` and the Solidity is a
silent post-migration verification failure.

- **B1** Golden vectors: for all 128 combinations the TS output must equal the bitmap
  produced by the Solidity reference (checked in as a generated fixture).
- **B2** Role constants used by the app match `RegistryRolesLib` exactly (nybble packing).
- **B3** `classifyNames` routes each fuse combination to the expected `tokenType`, and
  produces `not-transferable` / `unlocked-subname` / `frozen-approval` where required.
- **B4** `resolverStrategy` is `keep-v1` exactly when locked && `CANNOT_SET_RESOLVER`.

### Tier C — end-to-end (Playwright, on the Anvil fork)

`e2e/projects/manager/tests/migration-fuses.spec.ts`

Real V1 names wrapped on the fork, driven through the manager UI, verified against V2
on-chain state.

| ID | Name state | Assertion |
|---|---|---|
| C1 | locked, no extra fuses | `REGISTERED`, WrapperRegistry created, exact token + root role bitmaps |
| C2 | locked + `CANNOT_BURN_FUSES` | as C1, and **no admin bits** on either resource |
| C3 | locked + `CANNOT_SET_RESOLVER`, no resolver pinned | token lacks `ROLE_SET_RESOLVER`; see §6 for why the resolver is dropped |
| C3b | locked + `CANNOT_SET_RESOLVER`, uncertified resolver pinned | app blocks submission; name stays `RESERVED` (§6) |
| C4 | locked + `CANNOT_CREATE_SUBDOMAIN` | root bitmap lacks `ROLE_REGISTRAR`; registering a subname reverts |
| C5 | locked + `CANNOT_APPROVE` (no approval) | migrates normally |
| C6 | locked + `CANNOT_APPROVE` + approval set | app surfaces it as ineligible, never submits |
| C7 | locked + `CANNOT_TRANSFER` | app surfaces it as ineligible, never submits |
| C8 | locked + `CANNOT_SET_TTL` | migrates; bitmaps identical to C1 |
| C9 | locked + all compatible fuses | exact bitmaps for the combined case |
| C10 | unlocked wrapped 2LD | `REGISTERED`, **no** subregistry, `REGISTRATION_ROLE_BITMAP` |
| C11 | locked 2LD + locked child | parent-then-child ordering; child lands in parent's WrapperRegistry |
| C12 | locked 2LD + emancipated (unlocked) child | child migrates via the emancipated branch |

C11/C12 require subname support in the fixture, which does not exist yet.

## 5. Defects found

### Found while writing the plan

1. **`e2e/helpers/migration-assertions.ts` role constants were wrong.** They assumed one bit
   per role (`ROLE_RENEW = 1 << 2`) whereas `RegistryRolesLib` is nybble-packed
   (`ROLE_RENEW = 1 << 16`). Every `assertHasRoles` / `assertLacksRoles` call therefore
   tested unrelated bits. Nothing called them, which is why it went unnoticed. *Fixed.*
2. **`FUSES.CAN_EXTEND_EXPIRY` in `e2e/fixtures/makeV1Name.ts` could not be encoded.** It was
   `1 << 18` but `wrapETH2LD` takes a `uint16`; viem rejects it with *"Number 262144 is not
   in safe 16-bit unsigned integer range"*. The two specs that passed it (`CAN_EXTEND_EXPIRY`,
   `all child fuses`) could never have run green. *Fixed — split into `FUSES` /
   `PARENT_FUSES` with a guard that explains the constraint.*
3. **The `locked + CANNOT_TRANSFER migrates` spec asserted the opposite of the truth.**
   `test_migrate_lockedTransfer` proves the transfer reverts, and the app classifies the name
   `not-transferable`. *Fixed — now asserts ineligibility, paired with a healthy name to prove
   the app filters rather than aborts.*
4. **No existing fuse spec asserted any role.** They only checked `REGISTERED` + non-zero
   subregistry, so they could not detect a mapping regression — the entire point of fuse
   migration testing. *Fixed — both bitmaps are now asserted exactly.*
5. **Migration specs run nowhere.** `projects/manager/playwright.config.ts` excludes
   `/migration/` and no other project includes it, so the whole migration suite was dead
   code. *Fixed — added `playwright.migration.config.ts` and a `test:manager-migration`
   script.*

### Found while running the suite

6. **The V1 subgraph mock intercepted a dead host.** The app moved to
   `https://v1-graphql.ens.dev/subgraph`; the mock still matched the old Railway host, so it
   never fired and the UI saw zero V1 names. *Fixed — matches both hosts.*
7. **`reserveInV2` swallowed every error as "already RESERVED".** Its catch was
   `msg.includes('LabelAlreadyReserved') || msg.includes('0x')`, and nearly every EVM revert
   message contains `0x`. The real failure — the impersonated registrar had no ETH for gas —
   was hidden, the premigration reservation never happened, and the app then correctly
   reported "No eligible names found". *Fixed — checks status first, funds the impersonated
   registrar, and verifies the resulting status instead of assuming it.*
8. **The E2E fixtures pointed at a superseded deployment.** They hardcoded a NameWrapper /
   registry pair (`0xc7e0…` / `0x796f…`) that the app and the deployed migration controllers
   do not use. `LockedMigrationController.NAME_WRAPPER()` reads `0x0635…` and
   `ETH_REGISTRY()` reads `0xBDC8…` — the addresses `@ensdomains/ensjs` resolves. Test names
   were therefore created in a stack nothing else read. *Fixed — all E2E contract addresses
   now resolve through the same `ensjs` chain config the app uses, so they cannot drift again.*
9. **The forked V1 stack has no authorised `ETHRegistrarController`**, so the fixture's
   commit/reveal registration reverted. *Fixed — the fixture now grants itself BaseRegistrar
   controller rights (impersonating the registrar owner, `ETHRenewerV1`) and mints directly,
   which is also faster and ABI-independent.*

10. **The flow helper authorized only one transaction.** Migration sends more than one
    (HCA deployment and/or an approval, then the atomic batch). `authorizeTransaction`
    authorizes a single `eth_sendTransaction`, so the second sat in the headless wallet's
    queue forever: the UI stayed on "Upgrading your names...", logged nothing, and nothing
    reached the chain. *Fixed — uses `authorizeTransactionsWhile`, which keeps authorizing
    until the flow reports success.*
11. **The success assertion matched text the app never renders.** The specs waited for
    `"You're on ENS v2!"`; the dialog actually reads *"Your name(s) has/have been upgraded!"*
    with a `Close` button, not `Done`. Because the specs had never run, the wrong strings
    went unnoticed. *Fixed.*

## 6. `CANNOT_SET_RESOLVER` is gated, by design

A locked name whose resolver is pinned is **not** freely migratable. The app enforces two
invariants before it will submit:

* `assertLockedPublicResolverSetMembership` — the pinned V1 resolver must be certified in
  the on-chain `PublicResolverSet`, because that is the only case in which the controller
  may rotate it.
* `assertLockedResolverReplacementRecordSafety` — the atomic plan cannot replay records
  into the replacement resolver, so a rotation is permitted only once the V1 record
  inventory is proven empty.

On the current fork the V1 `PublicResolver` is **not** a member of the deployed
`PublicResolverSet` (asserted directly in the spec), so the app correctly refuses: the name
is listed and selectable but the submit button stays disabled and nothing is signed. That
is the behaviour the E2E now pins.

To test the *role mapping* for `CANNOT_SET_RESOLVER` in isolation, those cases wrap with no
resolver at all (`v1Resolver: zeroAddress`), which sidesteps the record-safety gate — there
are no records to lose — and leaves the fuse→role projection as the only variable.

## 7. Execution order

1. Tier A (fast, hermetic) — establishes the reference bitmaps.
2. Tier B (fast) — pins the app mirror to Tier A's output.
3. Tier C (slow, needs the fork + manager app) — proves the UI path end-to-end.

## 8. Not covered

* **C11 / C12 (locked and emancipated *children*) at the UI layer.** Both the `makeV1Name`
  fixture and the V1 subgraph mock only model `.eth` 2LDs; subname support is a separate
  piece of work. The underlying semantics are covered at the contract layer by
  `LockedMigrationFuseMatrix.t.sol` (`test_emancipatedChild_*`) and the existing
  `LockedMigrationController.t.sol` child tests.
* **`CAN_EXTEND_EXPIRY` at the UI layer**, for the same reason — it is unreachable on a
  `.eth` 2LD and only meaningful for children. Covered in Tiers A and B.
