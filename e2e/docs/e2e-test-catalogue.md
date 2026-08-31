# Comprehensive E2E Test Catalogue — apps-monorepo

The complete scenario space for **manager**, **portal**, and **cross-app**. This
is the *what*; [`e2e-build-goal.md`](./e2e-build-goal.md) is the *how*.

Supersedes §5–§6 of `e2e-master-test-plan.md`. Areas **A–L** and **X** keep their
existing IDs, because ~180 of them are already registered in
`e2e/coverage/scenarios.ts` and tagged in specs — renumbering would orphan that.
New areas (**N, Y, R, S, T, U, Z**) and the migration sub-areas (**GW/GS/GR/GM/GA/GU**)
extend it. Invariants are **INV1–INV5** to avoid colliding with area **I** (fuses).

**O** = oracle: the exact rule that decides pass/fail. Ranked per the oracle
hierarchy — chain read > exact transaction id > predicted confirmation count >
nonce delta > role/testid > text.

**Tier** = R0 irreversible · R1 financial · R2 authorization · R3 display ·
R4 resilience/quality. Work R0 first.

⚠️ = **probe before planning.** Reachability or oracle readability is unconfirmed.

---

## Part 1 — Surface inventory

The completeness backbone. Every route in both apps maps to at least one suite;
a route with no suite is a hole.

### manager (`:3000`)

| Route | Suite |
|---|---|
| `/` (landing) | U |
| `/dashboard` | H, S |
| `/$name` | H, E, B, T |
| `/$address` | H, R, S |
| `/p/$name` (redirect shim) | U |
| `/register`, `/register/$name` | A, Y |
| `/renew/$name` | B |
| `/migration`, `/migration_.nft` | G, T |
| `/auto-renewal` | Y |
| `/payment/add`, `/payment/list` | Y |
| `/notifications`, `/notifications/settings`, `/notifications/channels/email/verify` | N |
| `/wallet` | J |
| `/debug/backend`, `/debug/backend/settings` | out of scope (§6) |
| `/legal/*` | U |

### portal (`:3001`)

| Route | Suite |
|---|---|
| `/` (dashboard + search) | H, S |
| `/register` | A |
| `/$name` | H, T |
| `/$name/records`, `/edit-records` | E |
| `/$name/address` | R |
| `/$name/resolver`, `/change-resolver` | E |
| `/$name/registry` | D |
| `/$name/subnames`, `/create-subname` | D |
| `/$name/roles` | C |
| `/$name/ownership`, `/ownership/transfer` | F |
| `/$name/fuses`, `/fuses/burn` | I |
| `/$name/token` | T |
| `/$name/history` | H |
| `/addr/$addr` + `/names`, `/resolution`, `/reverse-resolution`, `/history` | R, S, H |
| `/registry/$address` + `/roles`, `/labels`, `/history` | C, D |
| `/resolver/$address` + `/roles`, `/nodes`, `/aliases`, `/create-alias`, `/history` | C, E |
| `/tld/$tld` | Z |

---

## Part 2 — Dimensions that multiply

Every scenario sits at a point in this space. Most defects live in combinations,
not in single cells — which is why the migration matrix is a matrix.

| Dimension | Values |
|---|---|
| **V2 name state** | available · reserved · registered · expired · unregistered |
| **Time window** | active · in grace (28d V2 / 90d V1) · in V1 continuity bonus (62d) · in premium (21d halving) · past premium |
| **Protocol version** | native V2 · migrated-from-V1 · unmigrated V1 · mid-migration |
| **V1 token shape** | unwrapped · wrapped · emancipated · locked · desynced · (subname variants) — 13 `.eth` types per `getNameType` |
| **Name depth** | 2LD · 3LD · 4LD+ |
| **Wallet mode** | EOA · Rhinestone HCA (ERC-4337) |
| **Actor** | owner · role-holder · operator (`setApprovalForAll`) · V1 manager · stranger · disconnected |
| **Data source** | on-chain · indexer (Panoptes) · indexer degraded · V1 subgraph |
| **Payment token** | each token in `paymentTokens.ts` |
| **Chain** | L1 (Sepolia fork) · L2 (reverse registrar) |
| **Locale** | en · de · es · ru · sv |
| **Viewport** | desktop · mobile |

---

## Part 3 — Suite catalogue

### A — Registration · R1

| # | Scenario | O |
|---|---|---|
| A1 | Register available 2LD, 1y, USDC, EOA | stage spine `deployingResolver → preparingCommitment → committingTransaction → commitmentCooldown → checkingAllowance → approvingToken → registeringDomain → success`; `getState()=registered`; expiry = now+1y |
| A2 | Same via Rhinestone HCA | spine `computingHcaBudget → checkingHcaFunding → signingFundingPermit → submittingSetupBundle → … → submittingRhinestoneBundle → verifyingRegistration → success` |
| A3 | Durations: 28d min, 1y, 2y, 5y, custom date | on-chain expiry matches selection exactly for each; price recomputes |
| A4 | Duration below minimum | UI blocks before the registrar's `DurationTooShort` |
| A5 | Each payment token in the picker | quoted total = base × oracle ratio; unsupported token absent |
| A6 | Insufficient balance / allowance | blocked or revert surfaced; no commitment consumed |
| A7 | Commitment too new — reveal before min age | holds in `commitmentCooldown`, does not submit early |
| A8 | Commitment too old (`@time`) | restarts the commit leg, does not revert |
| A9 | Commit replay, same label+secret | second commit rejected |
| A10 | Register an already-registered name | unavailable; register route redirects to profile |
| A11 | Register a reserved (premigrated) name | unavailable with the not-yet-migrated reason |
| A12 | Register during another name's grace (`@time`) | unavailable; renew offered to prior owner |
| A13 | Register after grace, inside premium (`@time`) | price = base + premium per `LibHalving` at day N |
| A14 | Register past the premium window (`@time`) | base only |
| A15 | Labels: <3 chars, emoji, ZWJ sequence, confusables, uppercase, trailing dot, unnormalised, 255+ chars | normalised or rejected with the specific message |
| A16 | Register while disconnected | connect prompt; flow resumes at the same step |
| A17 | Wallet rejects at commit / approve / reveal | machine → `error` with retry; no orphaned commitment |
| A18 | Refresh mid-flow, return | resumable state restored |
| A19 | Post-registration auto-setup | `syncingEthRecord → waitingForEthRecordSync → settingPrimaryName → success`; ETH record and primary name both on chain |
| A20 | Referrer in the URL | referrer reaches the contract call |
| A21 | Register a 3LD directly | offered only where the parent registry grants `ROLE_REGISTRAR` |
| A22 | Two tabs registering the same label | one wins; loser gets unavailable, not a stuck flow |
| A23 | Discount tiers (`register-v2/utils/discount.ts`) at each duration boundary | applied price matches the oracle's discount table |
| A24 | Price cooldown banner + decay chart (`PriceCooldownBanner`) | chart's plotted premium at time T equals the oracle's premium at T |
| A25 | Registration progress UX (`weave-registration`, `useRegistrationFillProgress`) | progress is monotonic, never regresses, reaches 100% only on `success` |

### B — Renewal, extension, grace · R1 · `@time`

| # | Scenario | O |
|---|---|---|
| B1 | Extend owned active name: 28d / 1y / picked date | new expiry = old + duration |
| B2 | Extend a name you do not own | succeeds — renewal is not owner-gated for the base case |
| B3 | Extend in grace, day 1 and day 27 | expiry computed from original expiry, not from now |
| B4 | Extend after grace | blocked; name shown available |
| B5 | Renew cannot reduce expiry | shorter target never offered |
| B6 | Grace banner + badge appear at expiry, clear on renewal | `GracePeriodBanner`/`Badge` state machine |
| B7 | Dashboard grace banner aggregating N names | count + CTA match `resolveDashboardGraceBanner` |
| B8 | Bulk renew 2 / 5 / 20 names, mixed active + grace | one plan, per-name line items, every expiry advanced on chain |
| B9 | Bulk renew with one name failing | `FailureStep` names the failure; others still renewed |
| B10 | Bulk renew pricing | total = Σ per-name oracle price (`bulk-renew/utils/pricing.ts`) |
| B11 | Renew deep link `/renew/$name`: connected, disconnected, unregistered, in-grace | each lands correctly |
| B12 | Renew with insufficient balance / allowance | blocked with the right copy |
| B13 | Renew a subname lacking `ROLE_RENEW` | blocked |
| B14 | **V1 renewal via `ETHRenewerV1`** — active · in-grace-still-in-grace · in-grace-out-of-grace · after-grace | the four contract branches |
| B15 | `syncWrapper` for wrapped and unwrapped V1 names | wrapper expiry synced post-renew |
| B16 | V1 continuity bonus at day 61 and day 63 | inside → bonus applied; outside → not |
| B17 | Renew → migrate in one session | V1 renewal makes a grace name eligible; migration then succeeds |
| B18 | Extend from every entry point: profile, dashboard row, address page, deep link | same on-chain result from all four |

### C — Roles & permissions · R2

| # | Scenario | O |
|---|---|---|
| C1 | Roles table lists every holder of every role | matches on-chain `roles()` per account |
| C2 | Grant a single role to a second wallet | bitmap changes; grantee gains the gated action |
| C3 | Grant several roles in one transaction | one batched call; bitmap exact |
| C4 | Revoke a role | bitmap cleared; grantee's action disappears after invalidation |
| C5 | Grant/revoke without the `_ADMIN` role | hidden; direct navigation not-authorized |
| C6 | Owner-with-admin vs root performing the same grant | both succeed |
| C7 | Roles while expired | matches `test_grantRoles_whileExpired` / `revokeRoles_whileExpired` |
| C8 | Roles while reserved | matches `test_grantRoles_whileReserved` |
| C9 | `setApprovalForAll` operator gains the blended role set | operator can `setResolver`/`setSubregistry`; revoking approval removes both |
| C10 | Max-assignee boundary ⚠️ | cap surfaced (may be unreachable via UI → probe) |
| C11 | Role history table | every grant/revoke with actor + block, in order |
| C12 | Roles after a transfer | post-transfer bitmap equals what the contract specifies; old owner holds none |
| C13 | Registry-level vs name-level roles are independent ⚠️ | granting at a name resource does not appear at the registry root resource (on-chain half verified; UI half blocked on indexer `registries` table) |
| C14 | Resolver-level per-key roles ⚠️ | `authorizeText/Addr/Data/Name` roles incl. `anyName` variants (blocked on indexer `resolvers` table) |
| C15 | Role admin chain: A grants admin to B, B grants the role to C, A revokes B | C's role survives or not, per contract semantics |
| C16 | Self-revoke of the last admin | UI warns of irreversibility (INV1 site) |
| C17 | Role change while a transaction for that role is in flight | no lost update |

### D — Registry & subnames · R2

| # | Scenario | O |
|---|---|---|
| D1 | Deploy a subregistry for a name with none | `getSubregistry()` non-zero |
| D2 | Create a 3LD subname | on-chain `registered` in the subregistry; appears in `SubnamesTable` |
| D3 | Create a 4LD under a 3LD with its own registry | nested resolution correct |
| D4 | Create without `ROLE_REGISTRAR` | blocked |
| D5 | Delete a subname | `unregister` succeeds; row gone |
| D6 | Delete without `ROLE_UNREGISTER` | blocked |
| D7 | Subname expiry cannot exceed the parent's | clamped or rejected |
| D8 | Parent expires → children | children unresolvable; UI states the parent-expired reason |
| D9 | `setSubregistry` / detach registry | incl. `notAuthorized` and `whileReserved` |
| D10 | Registry labels table + count ⚠️ | matches on-chain enumeration (blocked: indexer) |
| D11 | Registry tree ≥3 levels ⚠️ | renders the real hierarchy; each node navigable |
| D12 | Registry history / events ⚠️ | rows match emitted events |
| D13 | Registry add/edit user sheets ⚠️ | grant/revoke reaches chain |
| D14 | Registry upgrade + `ApprovedUpgradeGate` ⚠️ | approved target succeeds, unapproved rejected, requires upgrade role |
| D15 | Subname with a different owner than the parent | parent cannot seize; child's roles independent |
| D16 | 20+ subnames | pagination + ordering stable |
| D17 | Duplicate subname label | rejected, no partial state |
| D18 | Subname on a migrated **locked** parent (WrapperRegistry) | creation gated by `CANNOT_CREATE_SUBDOMAIN`→`ROLE_REGISTRAR` |

### E — Resolvers & records · R2/R3

| # | Scenario | O |
|---|---|---|
| E1 | Text records: set, update, delete, multiple keys in one save | on-chain `text()`; step count = changed keys |
| E2 | Addresses for multiple coin types (ETH 60, BTC 0, non-EVM) | `addr()` per coinType |
| E3 | Invalid address: too short, too long, bad checksum | rejected client-side |
| E4 | Contenthash, pubkey, ABI, interface | each set and read back; ABI content-type validation |
| E5 | Record edit without the per-key role | blocked |
| E6 | Change resolver | `getResolver()` updated; records read through the new one |
| E7 | Change resolver without `ROLE_SET_RESOLVER` (incl. migrated `CANNOT_SET_RESOLVER`) | guarded |
| E8 | Detach resolver (set zero) | `getResolver()=0`; profile shows no-resolver state |
| E9 | Resolver alias modes ⚠️ | five modes exist in the contract; the UI exposes no mode selector → **needs disposition, not a test** |
| E10 | Alias creation without `ROLE_SET_ALIAS` | blocked |
| E11 | Resolver nodes list + node detail | matches on-chain node set |
| E12 | Multicall partial failure ⚠️ | `multicallWithNodeCheck` is atomic — no partial state exists → **exempt or redefine** |
| E13 | Wildcard / `ENSV1Resolver` fallback for an unmigrated name | V1 data still resolves |
| E14 | Resolver upgrade ⚠️ | no UI affordance exists → **exempt to contract suite** |
| E15 | Records on a name whose resolver is a V1 PublicResolver post-migration | reads work; writes gated |
| E16 | Large record set (~50 texts) | all written; multicall chunking at `PROFILE_MULTICALL_CHUNK` boundary |
| E17 | Record value edge cases: empty string (= delete), 1KB value, unicode, emoji, leading/trailing whitespace | stored byte-exact or normalised deliberately |
| E18 | Social handle normalisation (`@handle` → `handle`) | normalised, not dropped |
| E19 | Pending-changes bar: add, edit, revert, discard, save | staged set equals submitted set |
| E20 | Records written by the EOA vs the HCA | both land; correct submitter (regression: profile edits submitted from the wrong account) |
| E21 | Agent-registration / ENSIP-25 key rendering | labelled, copyable card |

### F — Ownership & transfer · R0

| # | Scenario | O |
|---|---|---|
| F1 | Transfer each migrated V1 type: unwrapped, unlocked, locked | plan step count per `buildTransferPlan`; **locked must not offer a `detach-registry` its owner cannot execute** (E2E-001) |
| F2 | `CANNOT_TRANSFER` burnt in V1 | route shows transfer-unavailable (no `ROLE_CAN_TRANSFER_ADMIN`) |
| F3 | Subname transfer | currently unsupported — assert the explicit copy; flip when support lands |
| F4 | Transfer while expired | matches `test_transferWhileExpired` |
| F5 | Transfer to a contract that cannot receive ERC-1155 | **must reject before any irreversible step** (E2E-002: today it detaches the resolver then hangs) |
| F6 | Batch transfer, incl. one-error-aborts-all | `safeBatchTransferFrom` semantics |
| F7 | Post-transfer roles | new owner holds what the contract grants; old owner none |
| F8 | Manager/owner split — the V2 analogue of "sync manager" | registry control vs token owner asserted separately |
| F9 | Each detach-toggle combination (2³, minus the impossible) | step count matches the plan table; untouched targets byte-identical afterwards |
| F10 | Recipient as ENS name, address, name-with-whitespace, self, zero address, unresolvable | preview resolves or the right rejection |
| F11 | Transfer then the new owner operates the name | deploys a resolver, writes a record |
| F12 | Transfer with the resolver kept → ETH address repointed at the recipient | `addr()` = recipient |
| F13 | Non-owner and disconnected visitors | not-authorized / connect prompt |
| F14 | Transfer interrupted after step 1 of N | state recoverable; user told what already executed |

### G — Migration V1→V2 · R0 · the deepest matrix

Rows come from `getNameType`'s 13 `.eth` types × `classifyNames`' 5 token types
and 8 ineligibility reasons. Sub-IDs match the existing state-space plan.

**Note:** `wrapETH2LD` always burns `PARENT_CANNOT_CONTROL`, so a wrapped `.eth`
2LD is *at minimum* emancipated. `eth-wrapped-2ld` is not a real state — do not
write a scenario for it.

#### GW — wrap levels (2LD)

| # | Fixture | O |
|---|---|---|
| GW1 | unwrapped 2LD | `unwrapped`; ERC-721 → `UnlockedMigrationController`; reclaimed, resolver cleared, token in `Graveyard` |
| GW2 | emancipated 2LD (PCC only) | `unlocked`; ERC-1155 → same controller; unwrapped to `Graveyard`, NameWrapper is registry owner |
| GW3 | locked 2LD | `locked-2ld` → `LockedMigrationController`; **not** unwrapped; `WrapperRegistry` deployed as subregistry |
| GW4 | desynced 2LD | currently a silent drop — assert the UI says *something* (INV3) |
| GW5 | locked + `CANNOT_TRANSFER` **alone** | ineligible `not-transferable`, reason surfaced (must isolate the fuse — `Locked+All` conflates seven) |
| GW6 | locked + `CANNOT_SET_RESOLVER` alone | migrates with strategy `keep-v1`; V1 resolver preserved |
| GW7 | locked + `CANNOT_BURN_FUSES` | no `_ADMIN` roles granted |
| GW8 | locked + `CANNOT_CREATE_SUBDOMAIN` | no `ROLE_REGISTRAR` on the subregistry |
| GW9 | locked + `CAN_EXTEND_EXPIRY` | `ROLE_RENEW` granted on the token |
| GW10 | locked + `CANNOT_SET_TTL` | ignored; nothing breaks |
| GW11 | locked + `CANNOT_APPROVE` and a non-null `getApproved()` | `FrozenTokenApproval` — reason is declared but **never emitted**; expect it to proceed or fail on-chain (INV3) |
| GW12 | all child fuses burnt | ineligible via `CANNOT_TRANSFER`; UI names the reason |

#### GS — hierarchies

| # | Fixture | O |
|---|---|---|
| GS1 | locked 2LD + locked child, both selected | both migrate, **parent first** |
| GS2 | locked 2LD + emancipated child | child → `detached-child` via the parent's `WrapperRegistry` |
| GS3 | wrapped subname (PCC not burned), under an unlocked 2LD | **`copy`/`unlocked-child`** — re-created in the parent's `UserRegistry`, carrying its wrapper expiry |
| GS4 | unwrapped subname (registry-only) | **`copy`/`registry-child`** — re-created with expiry `MAX_UINT64` |
| GS5 | pcc-expired subname | define expected, then assert |
| GS6 | 3 levels: locked 2LD → locked child → locked grandchild | parent-first across 3; recursive WrapperRegistry derivation |
| GS7 | child selected **without** its parent | impossible by construction — descendant rows are not interactive; toggling a root toggles its subtree |
| GS8 | locked 2LD with many children | ordering × batching |
| GS9 | subname whose parent is absent from the selection | not offered — `hasCompleteCopyRoute` demotes it to `missing-parent` |
| GS10 | unlocked 3LD | migratable as a **copy** under an unwrapped/unlocked 2LD; still not under a locked one (GS15) |
| GS11 | mixed batch: 7 unwrapped + 8 unlocked + 9 locked | all 24 in one flow |
| GS12 | copy child whose V1 expiry has passed | ineligible `expired-registration` (a zero expiry without PCC is **not** expired) |
| GS13 | copy child with an empty / >255-byte / dotted label | ineligible `invalid-label` |
| GS14 | 3 levels of copy: unwrapped 2LD → registry 3LD → registry 4LD | a `UserRegistry` per copy parent, chained |
| GS15 | subname under a **locked** 2LD | **not** a copy — stays on the WrapperRegistry token route |
| GS16 | copy child on an unrecognised V1 resolver | ineligible `unsupported-resolver`; the parent still migrates |
| GS17 | copy re-run against a dirty deterministic registry slot | fails closed: `subregistry-conflict` / `v2-name-history` / `uncertified-registry` |
| GS18 | copy child owned by a different address than its parent | not offered |

**GS3, GS4 and GS10 were rewritten** when subname migration landed. All three
previously described the name as rejected; all three are now the copy route.
A copy has no transferable token, so it is *re-created* in a deterministic
per-parent `UserRegistry` rather than migrated — and survives classification
only if an `unwrapped` or `unlocked` .eth 2LD ancestor is migrating in the same
run. The app renders no ineligible list, so every negative here is observable
only as **absence**, and must be asserted alongside a control name that is
expected to appear.

#### GR — records (INV2 territory — highest severity found here)

| # | Fixture | O |
|---|---|---|
| GR1 | texts + ETH addr, known resolver | replayed onto the new resolver |
| GR2 | same on a subname | replayed |
| GR3 | custom/unknown resolver | `keep-v1`; V2 points at the V1 resolver; nothing replayed |
| GR4 | **contenthash** | **known lost** — migration reports success while destroying it |
| GR5 | **ABI** | known lost |
| GR6 | **pubkey** | known lost |
| GR7 | **interfaceImplementer** | known lost |
| GR8 | multicoin (BTC 0 + ETH 60) | both replayed |
| GR9 | text key outside the portal's defaults | replayed |
| GR10 | ~50 records | all replayed across multicall chunks |
| GR11 | resolver set, zero records | no-op, no failure |
| GR12 | resolver **not** in the hardcoded 9-address known list | silently degrades to `keep-v1` — assert the UI says so |

#### GM — managers & roles

| # | Fixture | O |
|---|---|---|
| GM1 | unwrapped, manager ≠ registrant | 2 extra confirmations: approve manager restoration + revoke temporary HCA access |
| GM2 | same, ETHRegistry pre-approved | confirmation count drops; pre-existing approval not revoked |
| GM3 | granted role bitmap | **exactly** `ROLE_SET_RESOLVER` and nothing else — assert the bitmap, not that the flow succeeded |
| GM4 | **wrapped** name with a distinct manager | `managerAddress` is only derived on the unwrapped branch — confirm the manager is ignored deliberately |
| GM5 | already-migrated name re-offered | `domain.isMigrated` is never consulted; `already-migrated` never emitted (INV3) |

#### GA — approvals, batching, expiry

| # | Fixture | O |
|---|---|---|
| GA1 | 1 missing token approval | per-token `approve` |
| GA2 | ≥2 missing | operator `setApprovalForAll` |
| GA3 | operator approval already present | zero approval rows |
| GA4 | 2+ wrapped names | `safeBatchTransferFrom` coalescing |
| GA5 | >29 names ⚠️ | multi-batch; **blocked** by the dev-panel cookie cap — needs a harness fix |
| GA6 | grace + renew, then migrate | renew→migrate completes (see B17) |
| GA7 | migrate at V1 grace day 45 and day 89 | succeeds; V2 expiry preserves V1 expiry |
| GA8 | migrate after V1 grace | not offered; name available/premium |
| GA9 | unmigrated name after V1 expiry | registry frozen; `ENSV1Resolver` resolves until V2 expiry; `Graveyard.clear()` reachable |
| GA10 | not owner / not approved / owner mismatch | each shows a **distinct** correct reason |
| GA11 | name-data mismatch (label ≠ tokenId) | `NameDataMismatch` — assert the app can never construct it. Carried from the superseded plan (G14) |
| GA12 | not reserved in V2 (premigration missing) | `test_*_notReserved` — the UI must not offer a name the controller cannot claim. Carried from the superseded plan (G15) |

#### GU — migration UX

| # | Scenario | O |
|---|---|---|
| GU1 | Migration list = exactly the migratable names, with per-name status | matches `classifyNames` on the same input; **no name in neither list** (INV3) |
| GU2 | Predicted vs actual wallet-confirmation count | count computed from chain state before clicking equals confirmations requested |
| GU3 | EOA nonce delta across the run | equals expected; no unrequested writes |
| GU4 | Edit profile immediately after migration | writes succeed on the new resolver |
| GU5 | Commemorative NFT (`/migration_.nft`) | minted/displayed per its rules |
| GU6 | Migration idempotence | already-migrated name blocked (see GM5) |
| GU7 | Interrupted mid-batch (reload, close tab) | resumable; no partial corruption |
| GU8 | Migration via HCA vs EOA | same end state, different confirmation profile |
| GU9 | Selection screen's promise vs what migrates | copy claims "names, text records, and addresses" — must not omit a record kind the user has (INV2) |

### H — Profile, dashboard, history · R3

| # | Scenario | O |
|---|---|---|
| H1 | Profile for each state: active, grace, expired, unregistered, reserved, subname, migrated-locked, unmigrated V1 | correct badge/banner/CTA set per state |
| H2 | Dashboard: V1-only, V2-only, mixed wallets | list = deduped union; correct protocol badge each (`mergedNames`) |
| H3 | Pagination, sorting, filtering at page 1 / N / N+1 | boundaries exact |
| H4 | Dashboard role-derived columns (`v1NameRoles`, `v2NameRoles`) | per-name role summary matches chain |
| H5 | Address page tabs: names, resolution, reverse-resolution, history | each matches its source |
| H6 | Name history `/$name/history` ⚠️ | events in order with correct actors (needs real indexer) |
| H7 | Favourites: add, remove, a name you do not own | persisted; survives reload |
| H8 | Recent-activity feed ⚠️ | rows match emitted events |
| H9 | Empty states: no names, no history, no subnames | distinguish *empty* from *unknown* (INV4) |
| H10 | Expiry rendering across all five states, in each locale | date + relative label correct |
| H11 | Profile of a name owned by a contract / HCA | owner rendered as such, not as an EOA |

### I — Fuses (V1 and migrated) · R0

| # | Scenario | O |
|---|---|---|
| I1 | Fuse list shows exactly the burnt fuses | `isFuseBurnt`, `useBurnedFuseCount` vs chain |
| I2 | Burn a fuse | on-chain fuse set; **irreversibility warning shown first** (INV1) |
| I3 | Burn blocked by `CANNOT_BURN_FUSES` | action absent |
| I4 | Parent- vs child-controlled fuses; PCC burn; extend-expiry grant | parent-owner and name-owner button sets differ correctly |
| I5 | Fuses view on a native V2 name | shows the role model, not fuses — no false V1 UI |
| I6 | Burn a fuse that makes the name unmigratable (`CANNOT_TRANSFER`) | warned *before* burning that migration becomes impossible (INV1) |

### J — Wallet, auth, network, HCA · R2/R4

| # | Scenario | O |
|---|---|---|
| J1 | Connect, disconnect, reconnect, reload | connection persisted |
| J2 | Account switch mid-session | every name-scoped query invalidated; permissions re-evaluated |
| J3 | Wrong network → switch prompt → success | chain guard |
| J4 | SIWE backend auth modal: sign, dismiss, token expiry | `_authenticated` routes gated |
| J5 | EOA vs HCA parity for register / renew / transfer / migrate | same end state |
| J6 | HCA failures: insufficient funding, permit rejected, bundle reverts, orchestrator down | each a distinct actionable error |
| J7 | HCA deployment on first use | account deployed once, reused after |
| J8 | Signature rejection at every prompt in every flow | no orphaned state anywhere |
| J9 | Session across tabs | one wallet, two tabs, no cache bleed |

### N — Notifications & api-worker · R3

Backend is `workers/api-worker` (Hono, JWT auth, queues for email/push/telegram,
DLQ, event ingestion, scheduled expiry discovery, SendGrid).

| # | Scenario | O |
|---|---|---|
| N1 | Email channel: add, verify via link, resend, wrong code, expired code | channel `verified` in the backend |
| N2 | Telegram channel: link, auth payload validation, unlink | `utils/telegram/auth` accepts only valid payloads |
| N3 | Push channel: permission grant, deny, subscribe, unsubscribe | subscription persisted |
| N4 | Preferences per notification type | saved and honoured |
| N5 | Inbox: list, unread count, filter badges, grouping, mark-read | grouping matches `utils/grouping` |
| N6 | Notification dropdown | unread count = inbox unread |
| N7 | Each template renders: name-expiry, name-transferred, blog-post, alpha-welcome, ens-update | correct name/date substitution |
| N8 | Expiry discovery → name-expiry notification `@time` | advance to N days pre-expiry; scheduled job produces one notification, not duplicates |
| N9 | Name transferred → notification for both parties | ordering with the transfer's own confirmation |
| N10 | Auth: unauthenticated access to `/notifications` | SIWE gate, then resume |
| N11 | Delivery failure → DLQ | failure does not lose the notification |
| N12 | Unsubscribe honoured end-to-end | no delivery after opt-out |

### Y — Payments & auto-renewal · R1 · **mock boundary only**

⚠️ Both are UI-only today: `payment/stores/payment-methods.ts` is a persisted
local store; `auto-renewal/MOCKS.ts` is three hardcoded names. **Assert the mock
contract, never chain.** Re-scope when a backend lands.

| # | Scenario | O |
|---|---|---|
| Y1 | Add each payment-method type (card, Google Pay, Apple Pay, PayPal) | store contains it; persisted across reload |
| Y2 | Remove a method | removed from the store |
| Y3 | Set default | moved to index 0 |
| Y4 | Empty state → first method added | list renders |
| Y5 | Auto-renewal list renders the mock names with expiry + price | matches `MOCKS.RENEWALS` |
| Y6 | Auto-renewal enable/disable toggles | state persists |
| Y7 | Payment-method selection inside bulk renew | selected method reaches the summary |

### R — Resolution: forward, reverse, primary, L2 · R3

| # | Scenario | O |
|---|---|---|
| R1 | Set primary name; unset | `addr()` + reverse record on chain |
| R2 | Primary name auto-set after registration | see A19 |
| R3 | Reverse resolution table per chain | matches `useReverseResolution` per chainId |
| R4 | Set L2 reverse name (`useSetL2ReverseName`) | requires the L2 connection; wrong network → switch prompt |
| R5 | Forward/reverse mismatch | `useReverseMatch` flags it explicitly |
| R6 | Address resolution table: multiple coin types, unset, invalid | per-coinType rendering |
| R7 | Forward names for a resolved address | list matches the resolver's records |
| R8 | Primary name for a name that later transfers | stale reverse record surfaced, not silently shown as valid |
| R9 | `/addr/$addr/resolution` and `/reverse-resolution` sidebars | detail matches the row |
| R10 | Primary name from each entry point (manager settings, profile, portal) | same on-chain result |

### S — Search & discovery · R3

| # | Scenario | O |
|---|---|---|
| S1 | Search: exact name, partial, address, invalid, unnormalised, already-owned, available | correct category per `buildSearchSuggestions` |
| S2 | Search result → correct destination for each category | routing |
| S3 | Search modal: keyboard nav, escape, empty query | `SearchModalContent` |
| S4 | Address search → address profile | `/p/$name` shim redirects an address to `/$address` |
| S5 | Search a name that exists only in V1 | shown with the V1 badge and a migration CTA |
| S6 | Search a reserved (premigrated) name | shown as reserved, not available |
| S7 | Debounce / race: type fast, results match the final query | no stale result wins |

### T — Token, metadata, NFT · R3

| # | Scenario | O |
|---|---|---|
| T1 | `/$name/token`: tokenId, uri, renderer | matches `getTokenId` / `uri()` on chain |
| T2 | `uri` unset vs set with a renderer | both render correctly |
| T3 | `setURI` without `ROLE_SET_URI` | blocked |
| T4 | Token page for a migrated locked name | tokenId is the WrapperRegistry's, not the parent's |
| T5 | Commemorative migration NFT | see GU5 |
| T6 | Token version id changes after regenerate/burn | `tokenVersionId` / `eacVersionId` reflected |

### U — App shell & chrome · R3/R4

| # | Scenario | O |
|---|---|---|
| U1 | Landing page renders, CTAs route correctly | |
| U2 | Navigation: every nav item, active state, mobile menu | |
| U3 | 404 for an unknown route; unknown name; unknown address | distinct not-found states |
| U4 | Legal pages render and are linked | |
| U5 | `/p/$name` shim: name → `/$name`, address → `/$address` | redirect target exact |
| U6 | Deep link to every route while disconnected | connect prompt, then resume at target |
| U7 | Browser back/forward through every multi-step flow | no orphaned state |
| U8 | Transaction modal / countdown UX (`shouldShowWaitCountdown`, `getActiveTransaction`) | countdown shown only when it should be |
| U9 | Theme / dark mode if present ⚠️ | |

### Z — DNS & non-`.eth` TLDs · R3

| # | Scenario | O |
|---|---|---|
| Z1 | `/tld/$tld` for `.eth` | registry, owner, history render |
| Z2 | `/tld/$tld` for a DNS TLD | `DNSTLDResolver` path; DNSSEC-enabled flag correct |
| Z3 | A DNS name's profile | resolves via the DNS resolver or states it cannot |
| Z4 | DNS claim flow ⚠️ | probe — parity with v3 `dnsclaim.spec.ts` may be out of scope |
| Z5 | Unsupported TLD | clear unsupported state, not a crash |

### K — Resilience & failure injection · R4

| # | Scenario | O |
|---|---|---|
| K1 | RPC 500 / timeout mid-flow | error with retry; never silent success |
| K2 | Indexer **down** | degrades to on-chain reads; degraded state visible |
| K3 | Indexer **up but stale/misconfigured** — returns success with zero rows | **must not present a confident negative** (INV4; this actually happened) |
| K4 | Orchestrator down on the HCA path | actionable error |
| K5 | Transaction reverts after submission | `error` state with the revert reason |
| K6 | Dropped/replaced transaction (higher nonce) | UI recovers |
| K7 | Reorg on the fork | state re-derived |
| K8 | Two tabs, conflicting writes on one name | last-write-wins, no corruption |
| K9 | Throttled network, double-click submit | exactly one transaction (nonce delta = 1) |
| K10 | Console error budget | zero unhandled errors/rejections per test |
| K11 | Subgraph (V1) down while migration is in progress | eligibility degrades safely, does not offer a name it cannot classify |
| K12 | Backend (api-worker) down | notification UI degrades; app still usable |

### L — Cross-cutting quality · R4

| # | Scenario | O |
|---|---|---|
| L1 | i18n: en, de, es, ru, sv on register + profile + migration | no missing-key markers, no overflow |
| L2 | a11y: axe on every top-level route, both apps | no serious/critical violations, or exempted |
| L3 | Keyboard-only completion of register, transfer, role grant, migration | reachable and operable |
| L4 | Mobile viewport: dashboard, profile, register, transfer, migration | `NameMobileCard` path; no horizontal scroll |
| L5 | Perf budget per route | recorded as a trend; fail only on large regressions |
| L6 | Number/date formatting per locale (`parse-localized-number`) | round-trips |

### X — Cross-app · R2/R3

Both apps share chain, indexer, and wallet. These assert they **agree**.

| # | Scenario | O |
|---|---|---|
| X1 | Register in manager → open in portal | owner, expiry, resolver, registry, roles all agree |
| X2 | Migrate in manager → inspect in portal | V2 registry/subregistry, role set per the fuse mapping, WrapperRegistry for locked |
| X3 | Grant a role in portal → grantee's manager UI gains the action | permission propagation |
| X4 | Transfer in portal → manager dashboards of both parties update | old owner loses it, new owner gains it |
| X5 | Edit records in manager → portal records table agrees (and the reverse) | resolver reads agree |
| X6 | Extend in manager → portal expiry, grace badge, premium state update | shared time semantics |
| X7 | Create a subname in portal → appears in manager's name list | |
| X8 | Set primary name in manager → portal reverse-resolution reflects it | |
| X9 | Two apps, two wallets, same name, simultaneously | no cache bleed across contexts |
| X10 | A name mid-migration | both apps show a consistent state — never one V1 and one V2 |
| X11 | Same name, indexer-backed view in one app vs chain-backed in the other | agree, or the divergence is visible |
| X12 | Burn a fuse in portal → manager migration eligibility changes accordingly | e.g. `CANNOT_TRANSFER` → no longer migratable |
| X13 | Deploy a subregistry in portal → manager subname creation now possible | |
| X14 | Detach a resolver in portal → manager profile shows no records, not stale ones | cache invalidation across apps |
| X15 | EOA in one app, HCA in the other, same underlying owner | both recognise ownership |
| X16 | Notification triggered by a portal action, read in manager | event ingestion end-to-end |

---

## Part 4 — Invariant sweeps

Not scenarios. Properties that must hold at **every** site. This is where the
severe findings came from. Site lists live in `e2e/coverage/invariants.ts`.

| # | Invariant | Sites |
|---|---|---|
| **INV1** | No irreversible write ordered ahead of a step that can fail | transfer plan · migration batch · record multicall · role grant/revoke · registry deploy + setSubregistry · resolver detach · fuse burn · renew+migrate |
| **INV2** | Conservation — nothing the user holds vanishes without being carried or explicitly warned. Enumerate the *before* state independently of the app's model. | migration (texts, every coinType, contenthash, ABI, pubkey, interface, roles, expiry, approvals) · transfer · resolver change · registry detach · upgrade |
| **INV3** | Totality — every input lands in exactly one **visible** bucket; no silent nulls; every declared reason is producible | `classifyNames` (5 types, 8 reasons — 3 currently unreachable) · dashboard lists · search results · transfer detach targets · migration eligibility |
| **INV4** | No confident negative without an on-chain cross-check | roles table · subnames table · history · activity feed · dashboard · registry detail · resolver detail · notification inbox |
| **INV5** | Every affordance offered is executable by the connected wallet, checked before it is offered | every role-gated button · every plan step · transfer recipient capability · fuse-gated actions · subname creation · renew |

---

## Part 5 — Traceability

Three matrices, each a completeness check. A source item with no row is an
explicit decision, not an oversight.

**5.1 contracts-v2 → scenarios.** Per test file, the UI-reachable branches:
`PermissionedRegistry` → A10–A12, B1–B5, C1–C17, D1–D18, F4–F7, T1–T6 ·
`ETHRegistrar` → A1–A14, B12 · `StandardRentPriceOracle` → A3, A5, A13, A14, A23, A24 ·
`ETHRenewerV1` → B14–B16 · `Unlocked/LockedMigrationController` → GW*, GS* ·
`MigrationHelper` → GS11, GA10 · `Graveyard` → GA9 · `UserRegistry` → D2–D7, D14 ·
`PermissionedResolver` → E1–E21 · `UniversalResolverV2`/`LibRegistry` → E13, R6, X11 ·
`L2ReverseRegistrar*` → R3, R4 · `DNSTLDResolver` → Z2, Z3 ·
`StandaloneHCA`/`HCA*Validator` → A2, J5–J7 · `ApprovedUpgradeGate` → D14.

**5.2 ens-app-v3 → disposition.** All 30 legacy specs: port · adapt · drop, never
blank. (`registerName`→A, `extendNames`→B, `createSubname`/`deleteSubname`→D,
`ownership.*`→C/D/F, `permissions`→I/GW, `wrapName`→drop as a V2 feature, keep as
a V1 fixture builder, `updateResolver`→E6–E8, `advancedEditor`/`profileEditor`→E,
`setPrimary`/`settings-primary-name`→R, `myNames`/`addressPage`→H/S,
`desyncedName`→GW4/X10, `un-normalised-name`→A15, `dnsclaim`→Z4,
`_importName`→drop, superseded by migration, `safe-ens-with-metamask`→J5–J7,
`settings`→J1–J4.)

**5.3 `getNameType` / `classifyNames` → migration rows.** All 13 `.eth` types map
to a GW/GS row; all 5 token types and all 8 ineligibility reasons are exercised
or recorded as unreachable (`registry-only`, `frozen-approval`,
`already-migrated` are currently dead code → GS4, GW11, GM5).

---

## Part 6 — Out of scope, with reasons

| Area | Reason |
|---|---|
| Contract-internal branches unreachable via UI | `contracts-v2` tests them better. Recorded as EXEMPT with citation. |
| `/debug/backend*` | Developer tooling, not user surface |
| `packages/dev-migration-tool`, `dev-time-travel`, `dev-dqa-overlay` | Test tooling — belongs in `harness.spec.ts`, not the product suite |
| Storybook stories | Component-level; covered by unit tests |
| `motion-plus`, `weave-loader` internals | Animation internals; only the progress *contract* is asserted (A25) |
| Real payment rails | No backend exists (see Y) |
| Mainnet behaviour | Suite runs on a Sepolia fork by design |

---

## Part 7 — Harness required, per suite

| Harness | Suites it unblocks |
|---|---|
| Role-parameterised name fixture + `assertRoleBitmap` | C, D, E, F, GM |
| N-deep subname fixture | D, F3, GS, X13 |
| ≥3 switchable funded wallets | every authorization negative, X15 |
| Time presets (`atExpiry`, `inGrace(n)`, `inPremium(n)`, …) | A12–A14, B*, GA6–GA9, N8 |
| Snapshot/revert per test | all — enables parallelism |
| **V1 fixture in the deployment the apps actually read** | **all of G** — currently the blocker |
| Premigration state builder | G, X10 |
| Real (not mocked) Panoptes fixture + per-fact sync waits | C1, C11, D10–D14, H6, H8, X11 |
| Cross-app fixture: one context, two base URLs, shared wallet | all of X |
| Transaction-id catalogue | every write flow's step-sequence oracle |
| Predicted-confirmation-count + nonce-delta oracles | GU2, GU3, K9, INV1 |
| Fault injection (RPC/indexer/orchestrator/backend/wallet) | K |
| Backend (api-worker) test harness + queue inspection | N |
| axe + locale + viewport harness | L |
| Dev-panel cookie fix (>29 names) | GA5 |

---

## Totals

290 scenarios plus 5 invariant sweeps across 32 sites — all registered in
`e2e/coverage/scenarios.ts` and `e2e/coverage/invariants.ts` as of 2026-08-11.
With the 10 `HW*` harness rows the ledger holds 300. `pnpm e2e:coverage` is the
status; this table is the intent.

| Suite | Count | Tier |
|---|---|---|
| A registration | 25 | R1 |
| B renewal/grace | 18 | R1 |
| C roles | 17 | R2 |
| D registry/subnames | 18 | R2 |
| E resolvers/records | 21 | R2/R3 |
| F transfer | 14 | **R0** |
| G migration (GW 12 · GS 11 · GR 12 · GM 5 · GA 12 · GU 9) | 61 | **R0** |
| H profile/dashboard | 11 | R3 |
| I fuses | 6 | **R0** |
| J wallet/auth/HCA | 9 | R2/R4 |
| N notifications/backend | 12 | R3 |
| Y payments/auto-renew (mock) | 7 | R1 |
| R resolution/primary/L2 | 10 | R3 |
| S search | 7 | R3 |
| T token/metadata | 6 | R3 |
| U shell/chrome | 9 | R3/R4 |
| Z DNS/TLD | 5 | R3 |
| K resilience | 12 | R4 |
| L quality | 6 | R4 |
| X cross-app | 16 | R2/R3 |

R0 (irreversible) is **79 scenarios**, of which the migration matrix is 59 and
currently at zero.
