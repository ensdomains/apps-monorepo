# Consolidated V1→V2 migration test plan, derived from the real state space

My earlier plan was assembled from the dev panel's presets outward — so it tested what the tooling
happened to express, and I mistook that for coverage. This one starts from the authoritative
definitions and works inward:

- **`ens-app-v3`** [`getNameType.ts`](../ens-app-v3/src/hooks/nameType/getNameType.ts) — the canonical
  enumeration of V1 name states (23 types) and the `wrapLevel` rule that produces them.
- **`ens-contracts`** [`INameWrapper.sol`](../ens-contracts/contracts/wrapper/INameWrapper.sol) — the
  fuse bits and which operations each one forbids.
- **`packages/migration`** [`classifyNames.ts`](packages/migration/src/service/classifyNames.ts) — how
  this PR collapses that space into 5 migratable token types and 8 ineligibility reasons.

Everything below is traceable to one of those three. Where I state a behaviour I have **observed**,
it is marked; where it is **derived from code but not yet run**, it is marked as such.

---

## Part 1 — The V1 state space

### 1.1 Wrap level (`getNameType.getWrapLevel`)

Four levels, decided in this order:

| level | condition |
|---|---|
| `unwrapped` | registry owner is **not** the NameWrapper |
| `locked` | wrapper-owned **and** child fuse `CANNOT_UNWRAP` |
| `emancipated` | wrapper-owned **and** parent fuse `PARENT_CANNOT_CONTROL` (no `CANNOT_UNWRAP`) |
| `wrapped` | wrapper-owned, neither of the above |

**Key consequence for .eth 2LDs:** `wrapETH2LD` always burns `PARENT_CANNOT_CONTROL | IS_DOT_ETH`,
so a wrapped .eth 2LD is *at minimum* `emancipated`. There is no `eth-wrapped-2ld` in the type union
— and the panel's preset currently *called* "Wrapped" is in fact an **emancipated 2LD**. My matrix
row A5 ("1 unlocked wrapped") was really "emancipated 2LD"; the migration classifier calls it
`unlocked` because it only looks for `CANNOT_UNWRAP`.

### 1.2 The 23 canonical types

`.eth` branch (the migration only handles `.eth`; DNS names are out of scope for this PR):

| # | NameType | level | notes |
|---|---|---|---|
| 1 | `eth-unwrapped-2ld` | 2LD | ERC-721 in BaseRegistrar |
| 2 | `eth-unwrapped-2ld:grace-period` | 2LD | expired, within 90d grace |
| 3 | `eth-emancipated-2ld` | 2LD | wrapped, PCC only |
| 4 | `eth-emancipated-2ld:grace-period` | 2LD | |
| 5 | `eth-locked-2ld` | 2LD | + `CANNOT_UNWRAP` |
| 6 | `eth-locked-2ld:grace-period` | 2LD | |
| 7 | `eth-desynced-2ld` | 2LD | registrar/wrapper out of sync |
| 8 | `eth-desynced-2ld:grace-period` | 2LD | |
| 9 | `eth-unwrapped-subname` | 3LD+ | registry-only, no wrapper, no registration |
| 10 | `eth-wrapped-subname` | 3LD+ | wrapper-owned, **PCC not burned** → parent can reclaim |
| 11 | `eth-emancipated-subname` | 3LD+ | PCC burned, unwrappable |
| 12 | `eth-locked-subname` | 3LD+ | PCC + `CANNOT_UNWRAP` |
| 13 | `eth-pcc-expired-subname` | 3LD+ | PCC lapsed with the parent's expiry |

Plus `root`, `tld`, and 8 `dns-*` variants (out of scope).

### 1.3 Fuses (`INameWrapper.sol`) — beyond the wrap level

| fuse | bit | forbids | migration relevance |
|---|---:|---|---|
| `CANNOT_UNWRAP` | 1 | unwrapping | sets `locked` |
| `CANNOT_BURN_FUSES` | 2 | burning more fuses | none observed |
| `CANNOT_TRANSFER` | 4 | **any transfer** | ⇒ **ineligible `not-transferable`** |
| `CANNOT_SET_RESOLVER` | 8 | changing resolver | ⇒ forces `keep-v1` strategy on locked names |
| `CANNOT_SET_TTL` | 16 | changing TTL | none |
| `CANNOT_CREATE_SUBDOMAIN` | 32 | new subnames | none |
| `CANNOT_APPROVE` | 64 | `approve()` | declared reason `frozen-approval` — **never implemented** |
| `PARENT_CANNOT_CONTROL` | 1<<16 | parent control | sets `emancipated` |
| `IS_DOT_ETH` | 1<<17 | — (marker) | — |
| `CAN_EXTEND_EXPIRY` | 1<<18 | — (grant) | none |

**This resolves my earlier "unexplained" E2 finding.** `Locked+All` burns all seven child fuses,
which includes `CANNOT_TRANSFER` — so it is *correctly* ineligible via
[classifyNames.ts:253](packages/migration/src/service/classifyNames.ts#L253). It was never a
mystery; the UI simply never says why. I was wrong to log it as unexplained.

---

## Part 2 — How the migration collapses the space

`classifyName` maps the 13 `.eth` types onto 5 token types. **Derived from code:**

| V1 type | → tokenType / outcome | route |
|---|---|---|
| `eth-unwrapped-2ld` | `unwrapped` | UnlockedMigrationController, ERC-721 transfer |
| `eth-emancipated-2ld` | `unlocked` | UnlockedMigrationController, ERC-1155 transfer |
| `eth-locked-2ld` | `locked-2ld` | LockedMigrationController |
| `eth-locked-subname` | `locked-child` | parent's certified `WrapperRegistry` |
| `eth-emancipated-subname` (parent locked) | `detached-child` | parent's `WrapperRegistry` |
| `eth-emancipated-subname` (parent unlocked) | ineligible `unlocked-subname` | — |
| `eth-wrapped-subname` | ineligible `unlocked-subname` | — |
| `eth-unwrapped-subname` | **silently dropped (`null`)** | — |
| any `:grace-period` | ineligible `expired-registration` | — |
| any with `CANNOT_TRANSFER` | ineligible `not-transferable` | — |
| `eth-desynced-2ld` | **silently dropped (`null`)** (registrant ≠ wrapper state) | — |
| `eth-pcc-expired-subname` | likely `unlocked-subname` / dropped | — |

### 2.1 Silent drops are a distinct, worse outcome

`classifyName` has two failure modes: `{type:'ineligible', reason}` and a bare `null`. A `null`
name never appears in the ineligible list either — it simply vanishes. Paths that return `null`:
unknown label, registrant mismatch, `parentName !== 'eth'` on the unwrapped branch, missing
wrappedOwner, unparseable holder.

That is why navigating to `/migration?names=X` for an unwrapped subname yields "No eligible names
found for this wallet" with no mention of X.

### 2.2 Three declared ineligibility reasons are never produced

`registry-only`, `frozen-approval` and `already-migrated` appear **only** in the `IneligibleReason`
union ([types lines 36, 39, 40](packages/migration/src/service/classifyNames.ts#L36)) — no code path
emits them. Verified by grep across `packages/migration` and `apps/manager`.

Consequences to test:
- **`already-migrated`**: `domain.isMigrated` from the subgraph is never consulted, so an
  already-migrated name is presumably offered again. Needs a test (M-AM below).
- **`registry-only`**: unwrapped subnames fall into the silent-`null` path instead.
- **`frozen-approval`**: `CANNOT_APPROVE` is never checked.

---

## Part 3 — Orthogonal dimensions

The wrap level is one axis. These multiply it, and each is independently migration-relevant.

### 3.1 Records — and a probable data-loss gap

`fetchV1Profiles` reads record **keys** from the subgraph's `resolver { texts coinTypes }` and the
values on-chain. Its output type is exactly:

```ts
export type Profile = {
  texts: readonly { key: string; value: string }[]
  addresses: readonly { coinType: bigint; value: Hex }[]
}
```

So **only text records and coin-type addresses are carried**. `contenthash`, `ABI`, `pubkey` and
`interfaceImplementer` appear nowhere in `packages/migration` or the migration feature (verified by
grep). A name serving an IPFS site via `contenthash` would migrate and **lose it**. This needs a
test (R-CH) and, if confirmed, is a release-blocking finding rather than a tooling gap.

Record sub-dimensions worth separate fixtures: none · texts only · multicoin addresses (BTC coinType
0 as well as ETH 60) · contenthash · a large record set (multicall chunking, `PROFILE_MULTICALL_CHUNK
= 700`).

### 3.2 Resolver

| resolver | strategy | note |
|---|---|---|
| none | `to-owned-permres` | |
| in `KNOWN_PUBLIC_RESOLVERS` | `to-owned-permres` | records replayed — **observed** |
| custom / unrecognised | `keep-v1` | V2 points back at the V1 resolver, **nothing replayed** — **observed** |
| locked + `CANNOT_SET_RESOLVER` | `keep-v1` | forced regardless of resolver |

The known-resolver list is a hardcoded array of 9 addresses
([knownResolvers.ts](packages/migration/src/contracts/knownResolvers.ts)). Any mainnet resolver
missing from it silently degrades to `keep-v1`.

### 3.3 Roles / managers

V1 has two distinct roles: **registrant** (ERC-721 owner / wrapper token holder) and **manager**
(V1 registry `owner(node)`). `classifyNames` sets `managerAddress` only when they differ, and only
for **unwrapped** names ([classifyNames.ts:163](packages/migration/src/service/classifyNames.ts#L163)).

On the V2 side the migration grants exactly **one** role:

```ts
const ROLE_SET_RESOLVER = 1n << 24n
```

So a V1 manager — who could set resolver, records, TTL, and create subnames — receives only
`ROLE_SET_RESOLVER` on V2. Whether that is intended is a question for the author; either way the
role-restoration test should assert the granted bitmap, not merely that the flow succeeded.

Untested combination: a **wrapped** name with a distinct manager. Because `managerAddress` is only
computed on the unwrapped branch, a wrapped name's manager is structurally ignored — worth
confirming that is deliberate.

### 3.4 Approvals held on V1

Independent of fuses, the owner may already have granted:
BaseRegistrar per-token `approve` · BaseRegistrar operator · NameWrapper per-token `approve`
(blocked by `CANNOT_APPROVE`) · NameWrapper operator · ETHRegistry(V2) operator.

These change the *plan*, and the pre-existing-approval cases are the ones that shrink the
confirmation count. Partly covered (A2/A4, M2).

### 3.5 Expiry

active · in grace (renewable) · in grace (not renewable) · fully expired. Grace names are excluded
as `expired-registration`, which is correct. The renew→migrate path remains untested (no renew
control in the panel).

### 3.6 V2-side starting state

available · reserved (pre-migration) · already registered/migrated. Only "reserved" is exercised
today, because the panel always reserves.

---

## Part 4 — Consolidated test matrix

Oracle convention: **N** = predicted confirmations from the formula in `pr-1017-test-plan-v2.md`;
**route** = expected controller/registry; **post** = on-chain post-condition.

### Group W — wrap levels (2LD)

| id | fixture | expect | status |
|---|---|---|---|
| W1 | unwrapped 2LD | `unwrapped`, ERC-721, UnlockedMigrationController | ✅ observed (A1–A4) |
| W2 | emancipated 2LD (wrapped, PCC only) | `unlocked`, ERC-1155 | ✅ observed (A5, mislabelled "wrapped") |
| W3 | locked 2LD | `locked-2ld`, LockedMigrationController | ✅ observed (A6) |
| W4 | desynced 2LD | silent drop — confirm, and that the UI says something | ❌ no fixture |
| W5 | locked 2LD + `CANNOT_TRANSFER` only | ineligible `not-transferable`, reason surfaced | ⚠️ only via `Locked+All` (conflates 7 fuses) |
| W6 | locked 2LD + `CANNOT_SET_RESOLVER` | migrates, strategy `keep-v1` | ❌ no fixture |

### Group S — subnames and hierarchies

| id | fixture | expect | status |
|---|---|---|---|
| S1 | locked 2LD + locked child, both selected | both migrate, **parent first** | ✅ observed (`Subname`) |
| S2 | locked 2LD + emancipated child (`detached-child`) | child routed to parent's WrapperRegistry | ❌ no fixture |
| S3 | wrapped subname (PCC not burned) | ineligible `unlocked-subname` | ❌ no fixture |
| S4 | unwrapped subname (registry-only) | currently a silent drop | ❌ no fixture |
| S5 | pcc-expired subname | define expected, then assert | ❌ no fixture |
| S6 | 3 levels: locked 2LD → locked child → locked grandchild | parent-first across 3 levels, recursive WrapperRegistry | ❌ no fixture |
| S7 | child selected **without** its parent | must fail closed ("Upgrade `<parent>` first") | ❌ untested |
| S8 | locked 2LD with **many** children | ordering + batching interaction | ❌ untested |

### Group R — records

| id | fixture | expect | status |
|---|---|---|---|
| R1 | texts + ETH addr, known resolver | replayed onto V2 | ✅ observed (`Records`) |
| R2 | same, on a subname | replayed | ✅ observed (`Subname+Rec`) |
| R3 | custom/unknown resolver + records | `keep-v1`, V2 points at V1 resolver | ✅ observed incidentally |
| R-CH | **contenthash** set | **CONFIRMED LOST** — see below | ✅ observed, **FAILS** |
| R-MC | multicoin (BTC coinType 0 + ETH 60) | both replayed | ✅ observed, PASSES |
| R-KEY | text key outside the portal's defaults (`com.github`) | replayed | ✅ observed, PASSES |
| R-ABI | **ABI** record set | **CONFIRMED LOST** | ✅ observed, **FAILS** |
| R-PK | **pubkey** set | **CONFIRMED LOST** | ✅ observed, **FAILS** |
| R-IF | **interfaceImplementer** set | **CONFIRMED LOST** | ✅ observed, **FAILS** |
| R-SOC | social handle `@ens_qa` | normalised to `ens_qa`, not dropped | ✅ observed, PASSES |
| R-BIG | ~50 text records | all replayed (chunking) | ❌ no fixture |
| R-NONE | resolver set, zero records | no-op, no failure | partially |

### Group M — managers / roles

| id | fixture | expect | status |
|---|---|---|---|
| M1 | unwrapped, manager ≠ registrant | `Approve manager restoration` + `Revoke temporary HCA access` (**2** extra confirmations) | ✅ observed |
| M2 | same, ETHRegistry pre-approved | N drops, no revocation of the pre-existing approval | ✅ observed |
| M3 | assert the **granted role bitmap** is `1<<24` and nothing else | — | ❌ never asserted |
| M4 | **wrapped** name with distinct manager | manager currently ignored — confirm intent | ❌ no fixture |
| M-AM | already-migrated name re-offered | `already-migrated` is unimplemented; expect it to be offered again | ❌ no fixture |

### Group A — approvals, batching, expiry

| id | fixture | expect | status |
|---|---|---|---|
| A-T1 | 1 missing token approval | per-token `approve` | ✅ |
| A-T2 | ≥2 missing | operator `setApprovalForAll` | ✅ |
| A-P | operator approval already present | zero approval rows | ✅ |
| A-W | 2+ wrapped names | `safeBatchTransferFrom` coalescing | ✅ observed (consequence only) |
| A-CA | `CANNOT_APPROVE` burned | `frozen-approval` unimplemented — expect it to proceed or fail on-chain | ❌ |
| A-GB | >29 names | **blocked**: panel cookie caps at 29; multi-batch needs ~102 | ❌ blocked |
| A-GR | grace + renew, then migrate | renew→migrate completes | ❌ no renew control |

---

## Part 4b — Results of the newly added fixtures

Six presets added and run. Oracle: the app's own `classifyNames` on the injected domains, plus what
`/migration` offers (`e2e/qa2-statespace.mjs`).

| id | preset | classified | ineligible | silently dropped | UI offers | verdict |
|---|---|---|---|---|---|---|
| S2 | `Detached` | `locked-2ld`, **`detached-child`** | — | 0 | `UPGRADE 2 NAMES` | **PASS** |
| S3 | `Wrapped sub` | `unlocked` (parent) | **`unlocked-subname`** (child) | 0 | `UPGRADE 1 NAME` | **PASS** |
| S4 | `Registry sub` | `unwrapped` (parent) | — | **1 (the child)** | `UPGRADE 1 NAME` | **PASS** (confirms the silent-drop finding) |
| W5 | `Locked -xfer` | — | **`not-transferable`** | 0 | `UPGRADE 0 NAMES` | **PASS** |
| W6 | `Locked -res` | `locked-2ld`, strategy **`keep-v1`** | — | 0 | `UPGRADE 1 NAME` | **PASS** |
| R-CH | `Records` + contenthash | migrates | — | — | — | **FAIL — contenthash lost** |

S2 is the important addition: `detached-child` is now reachable, so the recursively derived,
factory-certified parent `WrapperRegistry` route has a fixture. W5 settles the `Locked+All` question
by isolating `CANNOT_TRANSFER`. S4 demonstrates the silent-`null` path directly — the child is
injected, is genuinely owned by the wallet, and appears in neither the eligible nor the ineligible
list.

## Part 5 — Panel enhancements this requires

### Done in this pass

1. ✅ **`detached-child`** (S2) — locked parent + child with PCC only.
2. ✅ **`wrapped-subname`** (S3) — child with no fuses, so `unlocked-subname` is reachable.
3. ✅ **`unwrapped-subname`** (S4) — registry-only child, exposes the silent-`null` path.
4. ✅ **`contenthash`** (R-CH) — written by both record presets; confirmed the data-loss bug.
5. ✅ **Single-fuse variants** (W5, W6) — `CANNOT_TRANSFER` alone, `CANNOT_SET_RESOLVER` alone.
6. ✅ **`PRESET_SHAPES` table** — the mock's wrap level and fuses now derive from one declaration
   shared with creation, instead of ad-hoc `type === …` checks. This is what let the `records`
   preset be created unwrapped while the mock claimed wrapped, which made it vanish from the list.

### Still outstanding

7. **3-level hierarchy** (S6) — grandchild, for *recursive* WrapperRegistry derivation. The current
   subname presets only prove one level.
8. **Child selected without its parent** (S7) — must fail closed; no fixture yet.
9. **Multicoin + large record set** (R-MC, R-BIG) — trivial extensions of `writeV1Records`.
10. **`already-migrated`** (M-AM) — migrate, then re-offer; `domain.isMigrated` is never read.
11. **Role bitmap assertion** (M3) — assert exactly `1<<24`, not just that the flow succeeded.
12. **Cookie fix** (A-GB) — chunk it, store labels only, or move to `localStorage` with an explicit
    cross-origin sync. Until then multi-batch (~102 names) is untestable at 29.
13. **Renew control** (A-GR), **desynced 2LD** (W4), **pcc-expired subname** (S5).

---

## Part 6 — Findings from this analysis (independent of the fixtures)

1. **`contenthash` is silently destroyed by migration — CONFIRMED, release-blocking.**

   `Profile` carries only `texts` and coin-type `addresses`; `contenthash`, ABI, pubkey and
   `interfaceImplementer` appear nowhere in `packages/migration` or the migration feature. Measured
   end-to-end on `dev4104.eth` (`e2e/qa2-contenthash.mjs`):

   ```
   V1 resolver 0x8FADE66B…5B7dD contenthash: 0xe30101701220…2c7e3f1f   (fixture landed)
   migration: SUCCESS
   V2 resolver 0x35b6F4FccCf54edc3fF29c2C171CF12e07352AF0 contenthash: null
   profile shows description : true
   profile shows eth address : true
   ```

   Texts and addresses were replayed onto a freshly deployed owned resolver; the contenthash was
   not. **Any name serving an IPFS/IPNS website loses it on migration, with no warning in the UI** —
   and the flow reports success, because
   [verifyAtomicMigrationBatch](apps/manager/src/features/migration/service/verifyAtomicMigrationBatch.ts)
   only post-checks the records it knows about. The selection screen's promise ("Your names, text
   records, and addresses will migrate automatically") is technically accurate and precisely
   misleading: contenthash is neither a text nor an address.

   Fix options: carry `contenthash` (and decide about ABI/pubkey) through `Profile`, or warn
   explicitly on names that have one. Either way this should block release, not just QA sign-off.
2. **Three declared ineligibility reasons are dead code** — `registry-only`, `frozen-approval`,
   `already-migrated`. In particular `domain.isMigrated` is never consulted.
3. **Silent `null` drops.** Several paths make a name vanish with no ineligible entry and therefore
   no possible UI explanation. Combined with this PR dropping the `IneligibleReason` re-export from
   the manager's `classifyNames`, the codebase is moving *away* from being able to explain a drop.
4. **Only `ROLE_SET_RESOLVER` is restored** to a V1 manager. Possibly intended; currently unasserted.
5. **A wrapped name's distinct manager is structurally ignored** — `managerAddress` is only derived
   on the unwrapped branch.
6. **Record replay silently depends on a hardcoded 9-address resolver list.** Any resolver outside it
   degrades to `keep-v1`. This is the same risk as the PR's own `PublicResolverSet` release gate.
7. **Correction to my earlier report:** `Locked+All` being ineligible is **correct** —
   `CANNOT_TRANSFER` is among the seven fuses. I previously logged it as unexplained. The real defect
   is only that the UI does not name the dropped name or the reason.
8. **The panel's "Wrapped" preset is an emancipated 2LD**, not a merely-wrapped one — `wrapETH2LD`
   always burns PCC. `eth-wrapped-2ld` does not exist as a state.
