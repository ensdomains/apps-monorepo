# WEB-1396 — Transfer V1 names: QA test plan & report

PR: [#1134 Implement V1 name transfer functionality](https://github.com/ensdomains/apps-monorepo/pull/1134)
App: **portal** (`apps/portal`, `:3001`)
Spec: `e2e/projects/portal/tests/transfer.spec.ts` (`Portal name transfer — unmigrated V1 names`)
By hand: [`manual-v1-transfer.md`](./manual-v1-transfer.md)

Sibling of [`transfer-subname-web128-test-plan.md`](./transfer-subname-web128-test-plan.md)
(#1120, subnames). Findings prefixed **V1-F** to keep them apart from that
plan's `SUB-F` and from the `F1…F25` scenario ids.

---

## 1. Change surface

2172 additions / 767 deletions across 28 files — a **refactor of the whole
transfer feature**, not an additive change. Deletes `detachNameRegistry.ts`,
`detachNameResolver.ts`, `setEthAddress.ts` and `transferToken.ts`; rewrites
`useTransferName.ts` and `buildTransferPlan.ts`; adds a parallel V1 path.

| Area | Behaviour |
|---|---|
| `v1/rules.ts` → `getV1TransferGate` | Resolves a V1 name's ownership shape into **one of six outcomes**, each rendering its own card |
| `v1/writes.ts` | `BaseRegistrar.reclaim`, `BaseRegistrar.safeTransferFrom`, `NameWrapper.safeTransferFrom`, `ENSRegistry.setOwner`, `ENSRegistry.setResolver` |
| `hooks/useCanTransfer.ts` | One yes/no for the Transfer button across both protocols. V2: owner **and** `ROLE_CAN_TRANSFER_ADMIN`. V1: the full ownership shape, because `owner.owner` alone is not enough |
| `routes/$name/ownership/transfer.tsx` | Branches on `protocolVersion === 'ENSv1'` → `V1Transfer`, else `V2SendName` |
| `utils/buildTransferPlan.ts` | Now takes a subject `kind` and emits per-kind move steps |

### The split that has no V2 analogue

An unwrapped V1 2LD holds ownership in **two places**:

| Contract | Holds | Moved by |
|---|---|---|
| `BaseRegistrar` | the **registrant** (ERC-721) | `safeTransferFrom` |
| `ENSRegistry` | the **controller** (sets records) | `reclaim`, or `setOwner` |

They can be different accounts. A complete transfer moves both. Moving only the
token hands over the asset while leaving the old owner able to repoint the
resolver and rewrite every record.

**#1134 gets the ordering right, and says why** (`buildTransferPlan.ts`):

```ts
// Controller first: after the 721 moves the sender is no longer the
// registrant and can't reclaim, leaving them holding the controller slot.
'v1-registrar': ['reclaim', 'transfer-erc721'],
```

### The six gate outcomes

| Reason | Card title |
|---|---|
| `ok` | *(the transfer form)* |
| `grace` | "This name is in its grace period" |
| `expired` | "This name has expired" |
| `cannot-transfer` | "Transfer permanently disabled" |
| `manager-only` | "You manage this name but don't own it" |
| `not-owner` | "Not authorized" |

---

## 2. On-chain ground truth

Measured, not assumed. `seed:v1-transfer` seeds each shape and prints the two
ownership halves it produced; the dev-tools **Manager only** preset does the
same from the browser.

| Shape | registrant (`BaseRegistrar`) | controller (`ENSRegistry`) | gate |
|---|---|---|---|
| `ok` | you | you | `ok` |
| `manager-only` | account 1 | **you** | `manager-only` |
| `not-owner` | account 1 | account 1 | `not-owner` |
| `cannot-transfer` | you (wrapped, `CANNOT_TRANSFER`) | NameWrapper | `cannot-transfer` |
| `wrapped` (F26) | NameWrapper ERC-1155, you | NameWrapper | `ok` |
| `registry-only` (F27) | *(none — no ERC-721)* | you | `ok` |
| `grace` | you, expired 3d | you | `grace` |
| `expired` | released | you | `expired` |

---

## 3. Results

Run against a **fresh fork** (0 days drift) with Panoptes resynced, on
`qa/web-1396-v1-transfer` = `e2e-tests-coverage` + #1134.

### Regression: clean

**All six subname scenarios from #1120 pass** — F3, F15, F16, F19, F20, F21.
A refactor that deletes four helpers and rewrites the plan builder, with no
regression in the feature the previous PR added. That is what those tests were
written for.

`transfer.spec.ts`: **40 passed, 5 failed**, every failure accounted for:

| Failure | Category |
|---|---|
| E2E-002 (F5), E2E-003 (F14), E2E-010 | filed defects asserting their oracles |
| F2 | behaviour change — see V1-F1 |
| F23, F24 | my new tests, first draft — fixed, now green |

### New coverage — all passing, two consecutive runs

`buildTransferPlan` emits a **different move path per subject kind**, so each
kind needs its own end-to-end test — a plan that works for one says nothing
about the others:

| kind | move steps | covered by |
|---|---|---|
| `v2` | `transfer-token` | F15, F19, F20 (#1120) |
| `v1-registrar` (unwrapped 2LD) | `reclaim` → `transfer-erc721` | **F23** |
| `v1-wrapped` | `transfer-erc1155` | **F26** |
| `v1-registry` (legacy subname) | `set-registry-owner` | **F27** |

| # | Scenario | Oracle |
|---|---|---|
| F23 | Unwrapped V1 name, end to end | **both** the registrant and the controller read as the recipient. Driven through `reclaim` → `transfer-erc721`, so a change in plan shape fails loudly |
| F24 | `manager-only` | the refusal renders **and names the registrant in full**, so the reader knows who to ask |
| F25 | `CANNOT_TRANSFER` burnt | "Transfer permanently disabled", and the Ownership tab does not offer a link the route will refuse — the E2E-001 shape |
| F26 | **Wrapped** V1 name, end to end | exactly **one** step. A wrapped name lives entirely in the NameWrapper — the registry owner is the wrapper contract, so there is no controller slot to hand over and no `reclaim` to sequence. The registry owner must still be the NameWrapper afterwards |
| F27 | **Registry-only** V1 subname, end to end | `setOwner` is the whole transfer: no ERC-721, no ERC-1155, nothing to move but the registry entry. The **parent's** entry must be untouched |
| F29 | Sender **is** the controller | the resolver detach **is** offered (the positive half of F28), `detachRegistry` never appears for a V1 name, and the detach really clears the registry's resolver |
| F28 | Unwrapped V1 name you **own but do not manage** | neither record option is offered (the registrant cannot write records — the resolver authorises the *controller*), and `reclaim` takes the manager back from the third party onto the recipient |

Not automated: `grace`, `expired`, `not-owner` — all refusal states, all covered
by the manual plan and reachable from the dev-tools panel.

### Cross-checked against `ens-app-v3`

`ens-app-v3/e2e/specs/stateless/ownership.spec.ts` is the mature reference for
V1 send behaviour. Mapping its scenarios onto this suite found one gap worth
closing immediately and a prioritised list of the rest.

| `ens-app-v3` scenario | Here |
|---|---|
| send owner+manager of unwrapped 2LD, you are owner **and** manager | **F23** |
| send owner+manager of unwrapped 2LD, you are owner but **not** manager | **F28** — added from this review |
| cannot send if manager but not owner | **F24** |
| send wrapped 2LD | **F26** |
| send unwrapped subname as its manager | **F27** |
| send owner+eth-record, wrapped 2LD (record side) | **gap — G1** |
| send manager as **parent owner** of an unwrapped subname (`setSubnodeOwner`) | **gap — G2** |
| send manager, wrapped subname, as manager / as parent owner | **gap — G3** |
| send owner+eth-record of an **emancipated** subname | **gap — G4** |
| no send button when subname is wrapped and parent is unwrapped | **gap — G5** |
| no send button when parent is owner and not manager | **gap — G6** |

**F28**, the one closed here, is the mirror of F24 and the case where `reclaim`
does real work: with the controller held by a third party, the transfer has to
take the manager back and hand it to the recipient, or that third party keeps
managing the recipient's name. F23 could not catch a missing `reclaim`, because
there the registrant already held the manager.

It also pins a rule the reference makes obvious and the code states precisely:
for a `v1-registrar` subject, `getV1DetachTargets` gates both record options on
`canWriteRecords`, which means being the **controller**. The PublicResolver
authorises the registry owner, not the registrant — so an owner-not-manager
must be offered neither switch, and F28 asserts both are absent.

**Remaining gaps, in the order I would close them:**

1. **G2 / G3 — parent-owner and wrapped-subname sends.** Different write paths
   (`setSubnodeOwner` vs `setOwner`) and the largest untested surface.
2. **G5 / G6 — the two "no send button" refusals.** Cheap, and both are the
   entry-point/route agreement that E2E-001 was about.
3. **G1 / G4 — the record side and emancipated subnames.** `getV1DetachTargets`
   and `getV1ParentPowers` are covered only negatively so far: F28 asserts the
   options are *absent*, and nothing yet asserts they appear and work when the
   caller **is** the controller.

Note `getV1ParentPowers` returns empty for any 2LD by design, so the
parent-authority alert only has meaning for V1 **subnames** — untested, and
part of G2/G3.

---

## 4. Findings

### V1-F1 — Not a regression — F2 now renders the V1 card

`transfer.spec.ts`'s F2 builds a **migrated** locked name and expects the V2
card "Transfer not available". It now gets "Transfer permanently disabled",
which lives in `v1/V1Transfer.tsx`.

The name is being routed through the **V1** path, because `transfer.tsx`
branches on `protocolVersion === 'ENSv1'` and the portal classifies that
migrated locked name as ENSv1 — its ownership page renders a "Manager" row,
the V1 registrant/controller display. Before #1134 there was no V1 path, so
everything landed on the V2 component regardless of classification, and F2
passed without that ever being visible.

The refusal is still correct, and arguably better worded: a burnt fuse *is*
permanent. **The open question is whether a migrated name should classify as
ENSv1 at all** — pre-existing detection behaviour that #1134 is simply the
first code to act on. Worth the author's view.

Note F2's precondition was weak in a way that hid this: `assertLacksRoles`
passes whether the owner lacks the role *or the name is not in the V2 registry
at all*. It could not distinguish the two.

### V1-F2 — Stale blocker — `makeV1Name` works, the register says it does not

`e2e-defects.md` carries "makeV1Name builds names in a V1 deployment the apps
do not read (blocks all of §5.G / P3)". Measured against #1134: the portal
reads a `makeV1Name` name correctly, showing the registrant/controller split
and offering Transfer. A "repoint makeV1Name at the canonical V1 deployment"
commit evidently fixed it without the note being updated.

Left as-is here rather than edited in passing — it deserves its own check of
whether §5.G is genuinely unblocked, not a one-line amendment from a PR review.

### V1-F3 — **Corrected twice** — the Ownership tab shows the controller as owner (now **E2E-011**)

Recorded here as it was actually arrived at, because both wrong turns are
instructive.

**First claim, wrong:** "a split V1 name reads as *not registered*". Observed
on names built by the dev-tools `manager-only` preset. The real cause was that
I had removed `reserveInV2` from that preset on a hypothesis I then tested and
disproved but failed to revert. `resolveEnsOwner` needs the V2 reservation to
resolve a V1 name at all — measured: V2 status `0` → "not registered", status
`1` → renders. **My tooling bug, not an app defect.** The preset now reserves,
like every other.

**Second claim, also wrong:** with that fixed, a `test.fail()` repro asserting
"not registered is hidden" reported *"Expected to fail, but passed"* — correctly,
since the page does render.

**What is actually wrong**, and is now filed as **E2E-011**: with the two
halves in different hands, the tab prints the **controller** in both the Owner
and the Manager row. Chain says registrant `0x7099…79C8`, controller
`0xf39F…2266`; the page says "Owner 0xf39F…2266 · Manager 0xf39F…2266". So the
registrant — the account that holds the ERC-721 and the only one the registrar
lets transfer — appears nowhere, and a non-owner is labelled Owner.

The transfer route reads the same name correctly (F24 names the registrant), so
the data is reachable.

**Pre-existing — verified, not assumed.** Challenged in review, and rightly:
#1134 *does* edit `ownership/index.tsx`, so "not this PR's code" was an
inference. F33 was therefore run against a checkout **without** #1134 and
reproduces identically there. The PR's only change to that file swaps
`useCanTransferName` for `useCanTransfer`, gating the Transfer *button*; the
Owner and Manager rows read from `useEnsOwner` and are untouched.

**Lesson worth keeping:** the first two diagnoses were each made from a browser
observation without checking the chain state that produced it. The third was
made by reading both, and only then writing the assertion.

### V1-F4 — Blocker — `V1_PUBLIC_RESOLVER.setAddr` reverts, so no V1 name can have an addr(60)

Writing an address record to a V1 name reverts for the registry owner, on this
fork, through **both** routes:

- `makeV1Name({ records: { addresses: [...] } })` → `setV1Records` →
  `setAddr(bytes32,uint256,bytes)` on `V1_PUBLIC_RESOLVER`
- ensjs `setRecords` against the same resolver, the helper this spec already
  uses successfully for V2 names

`setResolver` on the legacy registry succeeds — only the record write fails —
and the caller is the node's registry owner, which is what `PublicResolver`
authorises against. So it is not ordering or authority as far as can be seen
from outside; the resolver simply refuses.

**What it blocks:** `setEthAddress` for V1 is only offered when the name has an
addr(60) (`getV1DetachTargets`), so its positive case cannot be exercised at
all. F29 therefore covers the `detachResolver` half of G1 and asserts
`setEthAddress` is *withheld* — correct here, but for want of a record rather
than want of authority, which is a weaker assertion than intended.

Not caused by #1134. Worth a short investigation of whether
`V1_PUBLIC_RESOLVER` is the right address for this deployment, since a working
one would also unblock G1 properly.

### Non-findings (verified working)

- V1 transfer moves **both** ownership halves, in the safe order.
- `manager-only`, `cannot-transfer` and the entry-point/route agreement all
  behave as specified.
- Transaction ids survive the rewrite (`transfer-${name}-${step}`), as do the
  option ids (`transfer-option-${key}`).
- 67 unit tests pass; the one expected fail is SUB-F2's `it.fails`, unchanged
  by this PR.

---

## 5. Environment

```bash
pnpm e2e:infra:up
pnpm --filter portal dev             # :3001 — VITE_USE_MOCK_WALLET=false for Playwright
pnpm e2e:portal --grep "@scenario:F23|@scenario:F24|@scenario:F25"
pnpm e2e:portal projects/portal/tests/transfer.spec.ts
SHAPE=ok pnpm --filter @ens-apps/e2e seed:v1-transfer
```

Two environment lessons this run, both of which cost time:

- **Reset the chain before a QA run.** Accumulated time-travel had the fork 142
  days ahead, which breaks registration pricing and produces failures that look
  like app bugs. A fresh fork costs a ~30-minute Panoptes resync and is worth it.
- **`.env` beats shell env in Vite** when the key exists in the file.
  `apps/portal/.env` sets `VITE_USE_MOCK_WALLET=false`, which silently
  overrides `VITE_USE_MOCK_WALLET=true pnpm dev`. Edit the file, or use
  `.env.local` — but note `.env.local` is read by **every** portal dev server
  on the machine, so it will break a concurrent Playwright run.
