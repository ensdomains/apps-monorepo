# WEB-1407 — Transfer V1 subnames (parent-initiated): QA test plan & report

PR: [#1144 Support transferring wrapped and unwrapped v1 subnames](https://github.com/ensdomains/apps-monorepo/pull/1144)
App: **portal** (`apps/portal`, `:3001`)
Spec: `e2e/projects/portal/tests/transfer.spec.ts` (`Portal name transfer — unmigrated V1 names`, the `#1144` block at its end)
By hand: [`manual-v1-transfer.md`](./manual-v1-transfer.md) § *Subnames moved by their parent*
Integration branch: `qa/web-1407-v1-subname-transfer` = `e2e-tests-coverage` + `pr-1144`

Sibling of [`transfer-v1-web1396-test-plan.md`](./transfer-v1-web1396-test-plan.md)
(#1134). Findings prefixed **V1S-F** to keep them apart from that plan's `V1-F`,
#1120's `SUB-F`, and the `F1…F40` scenario ids.

---

## 1. Change surface

1365 additions / 293 deletions across 18 files, all under `apps/portal`. #1134
let a V1 name be moved by its **holder**. #1144 adds a second actor: the
**parent's owner**, who can `setSubnodeOwner` a subname out from under its
holder — the path ens-app-v3 has always offered (`transferName` with
`asParent`).

| Area | Behaviour |
|---|---|
| `v1/rules.ts` → `getV1TransferGate` | Split into `gateAsHolder` then `gateAsParent`. `ok` now carries an **`actor`** (`'owner'` \| `'parent'`). Four new refusals: `ancestor-expired`, `ancestor-grace`, and `parent-cannot-reassign` × {`emancipated`, `wrapper-mismatch`, `registrant-only`} |
| `v1/getV1NameState.ts` | Reads the parent's shape (`V1ParentState`: owner, registrant, wrapped, `CANNOT_CREATE_SUBDOMAIN`) and the `.eth` 2LD ancestor's registrar status; pure `deriveV1NameState` split out for unit tests |
| `v1/writes.ts` | `prepareReassignV1SubnameTransaction`: `NameWrapper.setSubnodeOwner(parentNode, label, to, 0, 0)` for a wrapped child, `ENSRegistry.setSubnodeOwner(parentNode, labelhash, to)` otherwise |
| `utils/buildTransferPlan.ts` | `actor === 'parent'` → exactly `['set-subnode-owner']`, whatever options were asked for (step label *Reassign subname*) |
| `hooks/useTransferName.ts` | Submit-time re-gate refuses **`actor-changed`** if the wallet's role differs from the one the form was built for; copy for the new refusals |
| `v1/V1SendName.tsx` | Parent-acting warning naming the holder; `.eth` ancestor-in-grace warning; DNS-subname notice; no record options for a parent |
| `v1/V1Transfer.tsx` | Cards for each new refusal; subname-specific *expired* card; names normalised before the case-sensitive helpers |
| `components/SendNameForm.tsx` | **V2 too:** the parent-authority alert's self case now reads "…, which you own, so you keep authority over it — you can…" (was "its owner (you) keeps authority — they can") |
| `profile/hooks/useSubnames.ts` | ENSv1 subnames report `wrappedOwner ?? owner`, so a wrapped subname's owner is its holder rather than the NameWrapper — **affects every V1 subnames table**, not only transfer |
| `routes/$name/ownership/transfer.tsx` | A missing subname says "doesn't exist under *parent*" instead of "isn't registered" |

### Gate order (itself an oracle)

1. name in grace → `grace` · name expired → `expired`
2. `.eth` ancestor expired → `ancestor-expired` (either actor)
3. no live subject → `expired`
4. **as holder** — wins whenever the wallet is both holder and parent
5. **as parent** — `emancipated` · `wrapper-mismatch` · ancestor in grace → `ancestor-grace` (wrapped only; the registry has no expiry) · else `ok/parent`
6. the parent's registrant but not its controller → `registrant-only`
7. otherwise `not-owner`

## 2. On-chain ground truth

What the contracts actually do, which the gate claims to mirror:

| Claim in #1144 | Where it comes from | Checked by |
|---|---|---|
| Zero fuses + zero expiry keep what the subname has | `_updateName` ORs fuses; `_normaliseExpiry` never lowers | **F34** reads `getData` before and after |
| Wrapper refuses `setSubnodeOwner` from a `.eth` 2LD in grace | `onlyTokenOwner` → `canModifyName` → `_isETH2LDInGracePeriod` | **F39** |
| A child with `PARENT_CANNOT_CONTROL` cannot be reassigned | `canCallSetSubnodeOwner` | **F35** |
| Crossing the wrapper line force-wraps / unwraps | `setSubnodeOwner` on the wrapper wraps an unwrapped child | **F36** (refused up front) |
| `ENSRegistry.setSubnodeOwner` needs the parent's **controller** | registry `authorised(node)` | **F37** |

## 3. Scenarios

| # | Scenario | Oracle |
|---|---|---|
| **F30** *(flipped)* | Parent owner, unwrapped parent, registry child held by user3 | Ownership tab offers Transfer; the form warns the holder (truncated) loses it; no record options; one `set-subnode-owner`; child → recipient, parent untouched. Was "Not authorized" before #1144 |
| **F34** | Parent owner, wrapped parent, wrapped child held by user3 | as F30 through the NameWrapper; child's fuses **and** expiry byte-identical after; parent token unmoved |
| **F35** | Emancipated child | "This subname is out of the parent's control"; no form, no Ownership link |
| **F36** | Wrapped parent over a child unwrapped onto user3 | "Can't reassign this subname from here"; no form, no link |
| **F37** | Registrant but not controller of an unwrapped parent | "Reclaim the parent first"; no form, no link |
| **F38** | Holder hands the child to the connected wallet after the parent form rendered | submit refuses "How this name is held changed since the page loaded"; nothing sent |
| **F39** | `.eth` 2LD in grace, then past grace | grace: parent's move refused `<2LD> is in its grace period`, holder's goes through with the warning; expired: `<2LD> has expired` for both. Inside `withChainSnapshot`, last in the file |
| **F40** | `/nope.<parent>/ownership/transfer` | "doesn't exist under <parent>"; no form |
| **F16** *(updated)* | V2 subname alert, parent is self | new second-person copy; `(you)` gone |
| **F31** *(regression)* | Wallet is **both** holder and parent of a wrapped subname | still the holder path: one `transfer-erc1155`, not a reassign |
| **F32** *(regression)* | Emancipated subname you hold | still transfers; no reclaim warning |
| E2E-012 | Follow the F37 card: parent's Ownership page | must offer the reclaim it names — `test.fail()` |
| E2E-013 | Follow the F35 card: parent's Subnames page | must let the parent issue a subname — `test.fail()` |

**Not automated, and why:**

- **DNS subname notice** — the fork has no DNSSEC-claimed names to hang it off.
- **Subnames-table owner** (`useSubnames`) — the ENSv1 branch reads the
  hosted subgraph through ensjs, which the fork does not serve. Covered by the
  PR's unit test only.
- **Mixed-case URLs** (`sub.Florin.ETH`) — the route normalises before the
  transfer component mounts, so the `normalize` in `V1Transfer` is not
  reachable from a URL. Unit-level only.

## 4. Results

_(filled in from the runs below)_

## 5. Findings

### V1S-F1 — **E2E-012** — "Reclaim the parent first" names a control that does not exist

The `registrant-only` card ends: *"Reclaim the manager role on **parent** from
its Ownership page, then come back."* The portal has no reclaim control
anywhere outside the transfer feature — the Ownership page offers Transfer,
Extend, a read-only manager row and History. `reclaim` only ever runs as the
first step of transferring the parent to somebody else, which is not what the
user wants here. The refusal is correct; its way out is a dead end.

### V1S-F2 — **E2E-013** — the emancipated card sends a V1 parent to a page that cannot create V1 subnames

*"Once it expires you can issue it again from the Subnames page."* For a V1
parent the Subnames page renders no Create button (`canCreateSubname` is wired
only for ENSv2), and `/create-subname` answers *"This feature is only
available for ENSv2 names."* Separately, the card ignores
`CANNOT_CREATE_SUBDOMAIN`: `getV1ParentPowers` correctly drops *"issue it to
someone else once it expires"* when the parent burned that fuse, but this card
still promises it.

### Not findings

- **F16 failing on #1144** — an intended copy change, not a regression. Test updated.
- **F30 failing on #1144** — the oracle flipped by design. Test rewritten.

## 6. Environment

- Anvil panicked at 13:00 on 2026-09-10 mid-run: the upstream Sepolia RPC
  (drpc) timed out on a storage read and foundry crashed (exit 133). Manager's
  two late `registration.spec` failures fall inside that window. Stack
  restarted with the Panoptes `ens_v2.db*` wiped (a plain `infra:down` keeps
  the volume, and Panoptes would otherwise sit on the dead fork).
