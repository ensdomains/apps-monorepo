# E2E Defect Register

Index of defects found by the E2E suite. Governed by
[`e2e-goal.md`](./e2e-goal.md) — see that doc for the required fields, severity
definitions, and the triage rule.

Detail lives in the linked GitHub issue; this table is the traceability index
from plan scenario → defect → fix.

Severity: **S1** data loss / funds at risk / irreversible wrong on-chain write ·
**S2** core flow blocked, no workaround · **S3** wrong state shown, workaround
exists · **S4** cosmetic or copy.

Status: `open` → `triaged` → `fixed` → `verified` (verified = the test passes
with its original, unweakened assertion).

| ID | Scenario | App | Sev | Summary | Expected (oracle) | Repro | Issue | Status |
|---|---|---|---|---|---|---|---|---|
| E2E-002 | F5 | portal | S1 | Transfer to a non-receiver contract detaches the resolver irreversibly, then hangs — token never moves, no error shown | `buildTransferPlan` must not execute `detach-resolver` before a `transfer-token` that cannot succeed; `test_safeTransferFrom_invalidReceiver` must surface as an error, not a stall (plan §5.F F5, and the S1 rule in e2e-goal.md) | `pnpm e2e:portal --grep "@scenario:F5"` | _pending_ | open |
| E2E-001 | F1 | portal | S1 | Migrated locked V1 name offered a `detach-registry` step its owner cannot execute — `detach-resolver` had already run irreversibly | Owner lacks `ROLE_SET_SUBREGISTRY` on the locked name's `WrapperRegistry`, so `buildTransferPlan` must not offer the step. Measured in [`transfer-web446-test-plan.md`](./transfer-web446-test-plan.md) §2 finding F1 | `pnpm e2e:portal --grep "without offering the registry detach it cannot perform"` | _pending_ | fixed |

Status legend for the row above: **fixed** = the code fix landed
(`f524d71b3`, `dab56ec16` — role validation in `useTransferDetachTargets`) and
the regression test is committed (`ff2d85b30`), but this register will not say
`verified` until that test is observed green in a run recorded by
`pnpm e2e:coverage --results`.

---

## Environment blockers

Not defects — the app behaves as designed — but they stop scenarios reaching a
terminal state, so they are tracked here until fixed.

### Panoptes indexed a stale contract set — FIXED 2026-08-10

The portal's roles table reads the indexer first
(`features/roles/hooks/useNameRoleAccounts.ts`) and falls back to an on-chain
log scan **only when the GraphQL call errors**. Panoptes was running and synced
to head, but its contract manifest named a superseded `.eth` registry
(`0xdedb9291…`, alongside a stale `public_resolver` / `l2_eth_registrar` and
three zeroed migration controllers), so it skipped every event from the live
registry as an unknown contract. The GraphQL call therefore *succeeded* with
zero rows, the fallback never fired, and the table rendered "No role holders
yet" for names that plainly had holders. C1, C4 and C5 were blocked on it.

Fixed by regenerating `e2e/infra/panoptes/contracts.json` from
`ensL1Contracts[sepolia]` — the same config the apps read, so it cannot drift
from what they talk to — and re-indexing from the V2 deployment block
(`11383818`, found by bisecting `getCode`) rather than `10921984`. C1, C4 and
C5 now pass on two consecutive runs.

Two things worth keeping:

- **The root cause is config drift, and it is plural.** The same superseded
  deployment was hardcoded in `helpers/migration-assertions.ts` (fixed earlier)
  and still is in `e2e/infra/scripts/bake-contracts.py`, which names a *third*
  address again (`0x796fff2e…`). That script only feeds the snapshot-image
  path, currently disabled in CI, so it is out of scope here — but it will bite
  whoever re-enables it.
- **The app's failure mode is silent.** A reachable-but-misconfigured indexer
  returns success-with-no-rows, and the UI presents that as a confident false
  negative about permissions with no cross-check against chain. Plan K2 only
  specifies the indexer being *down*. If the roles table should never claim "no
  holders" without on-chain confirmation, that is a real S3 and needs an
  `E2E-###` row — still awaiting a ruling.

### Indexer lag races indexer-backed assertions

Panoptes polls every 2s, so a test that writes on-chain and immediately loads
an indexer-backed page can beat it. The race fails silently and permanently:
the query succeeds with no rows, the app renders its empty state, and
react-query caches that for the rest of the test.

`helpers/indexer-sync.ts` (`waitForIndexedRoles`) is the precondition. Pass it
**every account the assertion names** — waiting on the resource alone is
satisfied by the owner event that registration itself emits, while a grant made
afterwards may still be unindexed. C1 passed and then failed on the flake-gate
re-run for exactly that reason, before the helper was tightened.

### E9's alias-mode matrix is not reachable through the UI

Plan E9 asks for "the five alias modes: none, root, exact, subdomain,
recursive (`test_alias_*`)". The portal's `create-alias` route exposes no mode
selector at all — the form is two comboboxes, a source name and a target node,
and the mode is whatever the app picks. So four of the five modes cannot be
produced through the UI, and the fifth cannot be distinguished from the others
by anything the page shows.

E9 is therefore left **non-terminal** rather than partially claimed. It needs a
ruling, and the options are genuinely different work:

- **EXEMPT** — the mode matrix belongs to `PermissionedResolver.t.sol` and is
  not a UI concern. Needs a written exemption with an approver.
- **Narrow the scenario** — redefine E9 as "the one mode the UI can create,
  asserted on-chain", which is a real test worth having, and drop the matrix
  from the e2e plan's scope.
- **It is a gap in the app** — if users are meant to be able to choose a mode,
  the UI is missing it, and that is a feature defect rather than a test one.

E10 (alias creation without `ROLE_SET_ALIAS`) is unaffected and passes.

### E12 and E14 are not reachable through the portal

Checked while scoping the §5.E tail; recording so the next session does not
re-derive it.

- **E14 (resolver upgrade)** — there is no upgrade affordance anywhere under
  `routes/resolver/` or `features/resolver/`. `test_upgrade` / `canUpgradeFrom`
  are contract-level only.
- **E12 (multicall partial failure)** — record saves go through
  `multicallWithNodeCheck` (`features/records/helpers/saveRecords.ts`), which
  is atomic: the batch either lands or reverts. There is no partial-success
  state for the UI to surface, so "partial error semantics surfaced, not
  silently swallowed" has nothing to assert against.

Both need the same ruling as E9 — exempt to the contract suite, or redefine.
Left non-terminal rather than claimed.

### Panoptes never populates its `registries` or `resolvers` tables (blocks C13, C14, D10–D14)

Every `/registry/$address/*` page renders "Registry not found". The route reads
`getRegistryInfoQueryOptions` → the indexer's `registry(address:)` field
(`features/registry/hooks/useRegistry.ts`), and that returns `null` for every
address.

Measured 2026-08-10, after the contract-manifest fix:

- `{ registries(first: 5) { address } }` returns `[]` — the table is empty, not
  merely missing one entry
- yet the indexer log shows `Subregistry indexing: … from 47 subregistries` and
  `Backfilled 1 historical events for subregistry 0xc65230bb…`, and names
  inside those registries resolve fine

So Panoptes discovers subregistries and indexes their *events and names*, but
never creates a `registry` entity for any of them — including the `.eth`
registry itself. The sidebar can show a registry (it derives it from name data)
while the page built on `registry(address:)` cannot.

This is not a test problem, and it blocks more than one scenario:

- **C13** (registry-level vs name-level roles are independent) — the on-chain
  half is verified and correct: a grant at a name resource inside a subregistry
  does *not* appear at that registry's root resource. But the registry-level
  table cannot render, so the "two tables are independent" oracle is not
  assertable. Left non-terminal.
- **D10–D14** (registry labels, tree, history, add/edit user sheets, upgrade)
  all live under the same route and will hit this first.

Needs a ruling on whether the gap is in Panoptes' schema coverage or in the
app depending on an entity the indexer does not produce.

**Widened 2026-08-10 (same tick, later):** `resolvers` is empty too. Table by
table on a fully synced indexer:

| table | state |
|---|---|
| `domains` | populated |
| `events` | populated |
| `registries` | **empty** |
| `resolvers` | **empty** |

So the pattern is not one missing table — Panoptes indexes *events and names*
but produces none of the entity records the portal's detail pages are built
on. Anything reading `registry(address:)` or `resolver(id:)` renders
not-found, while anything reading names or replaying events works.

That adds **C14** (resolver per-key roles, `/resolver/$address/roles` →
`getResolverOverviewQueryOptions` → `resolver(id:)`) to the blocked set. Note
E11 passes on `/resolver/$address/nodes`, which does not go through that query
— so the blocker is per-route, not per-section, and is worth checking before
scoping any future batch that touches a detail page.

### makeV1Name builds names in a V1 deployment the apps do not read (blocks all of §5.G / P3)

`fixtures/makeV1Name.ts` registers through V1 contracts at `0xF42dF26c…` /
`0x64096092…` / `0xc7e033b8…`. The manager's migration code resolves its V1
contracts through ensjs — `features/migration/service/checkHelperApprovals.ts`
calls `getChainContractAddress` for `ensBaseRegistrarImplementation` and
`ensNameWrapper` — which gives `0x57f1887a…` / `0x0635513f…`.

Both deployments are live on the fork and both have code, so registration
succeeds and nothing errors. The names simply land in a registrar the app never
looks at. **Every V1 name the suite creates is invisible to the app under
test.** That is the root reason the §5.G migration matrix has no working
coverage, and it compounds with the manager project's `testIgnore` excluding
those specs — two independent problems, each of which would hide the other.

Attempted the switch this tick and it is not address-only:

- the two controllers share an ABI and produce **identical** commitment hashes,
  so the encoding is compatible
- but `register` reverts on the ensjs controller ("unknown reason"), so
  something in the flow differs — fee, commitment age, or parameter semantics

Reverted rather than left half-applied: a fixture pointing consistently at the
wrong deployment is easier to reason about than one split across two. The V2
half of the same file *was* fixed and verified (see the reserveInV2 commit).

Next step is to decode that revert against the ensjs controller and adapt the
registration flow. Until then §5.G, HW10 and P3 stay blocked.

---

## E2E-002 detail

Recipient `0xcA11bde05977b3631167028862bE2a173976CA11` (Multicall3) is deployed
but is not an ERC-1155 receiver, so `safeTransferFrom` to it reverts. The
portal's transfer form accepts it with no client-side warning and the "Transfer
name" button stays enabled.

Measured 2026-08-10 on the fork:

- **Step 1, `detach-resolver`: executed and confirmed on-chain.** The resolver
  goes from `0x640294A2b2D87E7f522db3e3E3E876764BCe170D` to
  `0x0000000000000000000000000000000000000000`.
- **Step 2, `transfer-token`: never completes.** The dialog sits on a disabled
  "Waiting…" button indefinitely. No error, no revert reason, no retry.
- **`ownerOf` is unchanged** — the token never moved.

Net effect: a user who mistypes a contract address loses their resolver and
gets no indication anything went wrong. The name stops resolving, and the
transfer they asked for did not happen.

This is the same shape as E2E-001 — an irreversible write ordered ahead of a
step that cannot succeed — but reached through a different door. E2E-001 was
fixed by validating *roles* before offering `detach-registry`; nothing
validates that the *recipient* can receive the token before `detach-resolver`
runs.

Two things would each be sufficient: reject a recipient that is a contract
without ERC-1155 receiver support before the plan starts, or order
`transfer-token` first so the irreversible step only runs once the transfer is
known to succeed.

**Confirmed present on `origin/main` @ c3be87173** (2026-08-10), i.e. after
#926 "Ability to Transfer Ownership V2 names" landed. Verified two ways, since
#926 reworked this exact route:

- *Source*: `buildTransferPlan.ts` still pushes `detach-resolver` before
  `transfer-token`, and `SendNameForm.tsx`'s `hasValidRecipient` checks only
  non-empty / not-self / not-zero-address — nothing tests whether the recipient
  can receive an ERC-1155.
- *Empirically*: main checked out in a worktree, portal built and served from
  it, F5 run against it. Identical result — resolver
  `0x640294A2b2D87E7f522db3e3E3E876764BCe170D` → `0x0000…0000`, token
  unmoved, no error surfaced.

So this is not something the branch introduced and not something main has since
fixed.
