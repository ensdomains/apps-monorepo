# WEB-128 — Transfer subnames (V2): QA test plan

PR: [#1120 Support transferring v2 subnames](https://github.com/ensdomains/apps-monorepo/pull/1120)
Apps: **portal** (`apps/portal`, `:3001`) and **manager** (`apps/manager`, `:3000`)
Spec: `e2e/projects/portal/tests/transfer.spec.ts` (`Portal name transfer — subnames`)
By hand: [`manual-subname-transfer.md`](./manual-subname-transfer.md)

Extends [`transfer-web446-test-plan.md`](./transfer-web446-test-plan.md), whose
finding **F4** ("subnames are gated client-side only… worth confirming with the
PR author whether that is the intent") is the note this PR answers.

Findings here are numbered **SUB-F1…** to avoid colliding with that plan's
local `F1…F4` findings *and* with the `F1…F21` scenario ids — a collision that
already exists in the tree.

---

## 1. Change surface

Two hard blocks removed:

| Where | Was |
|---|---|
| `routes/$name/ownership/index.tsx:129` | `canTransfer = … && !isSubname` |
| `routes/$name/ownership/transfer.tsx` | a `match` arm rendering "Transferring subnames isn't supported yet" |
| `manager/…/setupControlledResolver.ts:114` | `throw new Error("This subname can't be set up here yet…")` |

Three pieces of machinery added:

| Area | Behaviour |
|---|---|
| `useParentAuthority` | For a subname only: reads what the **parent's owner** can still do and warns. Renders `null` while loading and when the parent holds nothing; renders an "we couldn't check" variant on error |
| `getSubnameExpiry` → expiry gate | `PermissionedRegistry.getExpiry` on the holding registry. `<=` mirrors `_isExpired`, so **`0` renders as expired** |
| `getOwnResolver` | Replaces `useNameResolverAddress`. Reads `registry.getResolver(label)` — the name's **own** slot — where the old code read the UniversalResolver and so returned the **inherited** resolver |

### The three "powers", and which registry answers each

This is the part that is easy to get wrong, and the reason §2 is measured
rather than reasoned about:

| Power | Role | Registry | Resource |
|---|---|---|---|
| reclaim now | `ROLE_UNREGISTER` | the subname's holding registry | the subname's label |
| re-issue after expiry | `ROLE_REGISTRAR` | the same registry | **ROOT `0`** — `_register` asserts against `ROOT_RESOURCE`, so a per-name check is a false negative |
| repoint the registry | `ROLE_SET_SUBREGISTRY` | the **parent's** registry | the **parent's** label |

### Guard order in `transfer.tsx` — itself an oracle

`loading` → `expiry error` → **expired** → `role error` → `not authorised` →
form. So an expired subname whose owner also lacks the transfer role must show
the *expiry* card, never "Transfer not available".

---

## 2. On-chain ground truth

**Measured, not assumed** — `e2e/scripts/probe-subname-transfer.ts` seeds each
shape and reads the chain back. Run it with
`pnpm --filter @ens-apps/e2e probe:subname-transfer`.

| Shape | own resolver | own subregistry | transfer role | reclaim | re-issue | repoint |
|---|---|---|---|---|---|---|
| `all-powers` (default) | `0x0` — inherited | `0x0` | yes | yes | yes | yes |
| `separate-owners` (sub → `user2`) | `0x0` — inherited | `0x0` | yes | yes | yes | yes |
| `own-resolver` | a real resolver | `0x0` | yes | yes | yes | yes |
| `no-transfer-role` (sub → `user3`) | `0x0` — inherited | `0x0` | **NO** | yes | yes | yes |

Two facts the probe established that changed how the scenarios are written:

```
hasRoles(resource, bitmap, account)
  → roles[ROOT_RESOURCE][account] | roles[resource][account]
```

- **Whoever deploys the subregistry holds every role at its ROOT.** Withholding
  a role from a subname whose owner is also the deployer reads as no
  withholding at all. `no-transfer-role` therefore hands the subname to a third
  account. The first draft did not, and the probe reported the role still held
  — the scenario would have asserted nothing.
- **Withholding a role means clearing its whole nybble _and_ the admin
  counterpart 128 bits higher.** Masking only the admin half leaves the role
  set. V2 packs a count into each nybble, so `1n << n` is not the unit to mask.

---

## 3. Scenarios

**O** = oracle (the exact rule that decides pass/fail).

### A. The gate is gone

| # | Scenario | O |
|---|---|---|
| A1 (`F3`) | Subname `/ownership` and `/ownership/transfer` | the Transfer link is offered **and** the route renders the recipient form; the pre-#1120 refusal copy is absent. Both halves — a half-reverted gate would pass either alone |

### B. The transfer itself

| # | Scenario | O |
|---|---|---|
| B1 (`F15`) | Transfer a subname end to end | the token moves in the **parent's subregistry**; the parent's own owner, resolver and subregistry pointer are byte-identical afterwards |
| B2 (`F19`) | Subname with an **inherited** resolver | neither `#transfer-option-detachResolver` nor `#transfer-option-setEthAddress` renders; one-step plan; the **parent's** resolver is unchanged after |
| B3 | Subname with its **own** resolver | both options render; defaults clear the subname's own resolver only. *Covered manually (`own-resolver` shape); not yet automated* |

### C. The warning

| # | Scenario | O |
|---|---|---|
| C1 (`F16`) | Parent owner holds all three powers | all three clauses render, joined `a; b; and c`; `(you)` when the reader owns the parent; a 2LD shows no such alert at all |
| C2 | Parent owner holds a subset | exactly the held clauses, no joiner for one. *Not yet automated* |
| C3 | Parent owner unresolvable | should be the "couldn't check" variant, **not** silence — see SUB-F2 |

### D. Guards

| # | Scenario | O |
|---|---|---|
| D1 (`F21`) | Owner lacks `ROLE_CAN_TRANSFER_ADMIN` | "Transfer not available", no form. Asserted with an owner who is **not** the subregistry deployer |
| D2 | Expired subname | "This subname has expired", no form. Needs the browser clock moved too, not just the chain. *Not yet automated* |
| D3 | Expired **and** unauthorised | the expiry card wins. *Not yet automated* |

### E. Regression

| # | Scenario | O |
|---|---|---|
| E1 | The whole pre-existing `transfer.spec.ts` | green. #1120 rewrites `useTransferDetachTargets`, the exact hook whose role validation fixed **E2E-001** |
| E2 | 2LD transfer | unchanged; no parent-authority alert |

---

## 4. Findings

### SUB-F1 — Note — the roles panel takes ~29s to settle on a local fork

Not this PR, and not a product defect — recorded because it cost a debugging
cycle and will cost the next person one too.

Since #1131/#1137 the roles panel reads role changes from on-chain logs
(`getRoleChangeLogs`, `fromBlock: ROLES_FROM_BLOCK = 11_383_818`) instead of
from the indexer. Against a local Anvil fork that is a ~284k-block scan which
Anvil serves in small chunks, because the same 20k-log cap documented in
`e2e-defects.md` forces it to shrink them. **Measured: 29.1s** from navigation
to the first rendered row — under the 30s assertion timeout the C1 tests used
by less than a second, which is precisely the shape of a test that passes on
one machine and fails on the next. `ROLE_PANEL_TIMEOUT` in `roles.spec.ts` is
now 120s with the measurement recorded beside it.

Real Sepolia RPCs answer an indexed-topic `eth_getLogs` over the same range
quickly, so this is a fork artifact. Worth re-measuring if the panel ever feels
slow in a deployed environment.

### SUB-F2 — Open question — an unresolvable parent renders silence, not "unknown"

If the parent owner resolves to `zeroAddress` or cannot be resolved, all three
role queries are `enabled: false`, so `hasAnyAuthority` is `false` and
`isError` is `false` — and the component renders **nothing**. The hook's own
doc comment says a failed read must be treated as *unknown*, never as *no
authority*, and the error variant exists for exactly that. This path routes
around it.

Not yet reproduced on demand — a deep subname with a partially unowned ancestor
chain is the realistic trigger. Flagged for a ruling rather than filed as an
`E2E-###`, per `e2e-build-goal.md` §12.

### SUB-F3 — Open question — only the immediate parent is inspected

`useParentAuthority` reads the immediate parent only. A grandparent holding
root roles over the whole subregistry tree is not surfaced, so for a 4LD the
warning can understate who really has power over the name. Whether that is
intended scope is a product question.

### Non-findings (verified working)

- The gate is genuinely gone: the Transfer link renders and the route shows the
  form for a subname whose owner holds the transfer role.
- The warning composes correctly, including `(you)` and the `; and ` joiner —
  the exact string is in the spec and in `manual-subname-transfer.md`.
- An inherited resolver correctly offers neither detach option, and the
  parent's resolver survives a transfer byte-identical.
- The token moves in the parent's subregistry, leaving the parent's own token
  untouched.
- A subname owner without `ROLE_CAN_TRANSFER_ADMIN` is refused.
- The alert appears **323ms** after navigation — the "form visible, button
  disabled, no explanation" window is real but short.

### Not yet covered

Automated: C2 (partial powers), D2/D3 (expiry), B3 (own-resolver transfer).
**Manager entirely** — `setupControlledResolver`, edit-profile save and
primary-name selection for a subname, which the PR author asked for
specifically because the portal preview cannot exercise them.

---

## 5. Environment

```bash
pnpm e2e:infra:up                    # anvil :8545, panoptes :5655, alto, paymaster, dqa :4000
pnpm --filter portal dev             # :3001 — VITE_USE_MOCK_WALLET unset/false for Playwright
pnpm --filter manager dev            # :3000

pnpm e2e:portal projects/portal/tests/transfer.spec.ts
pnpm e2e:portal --grep "@scenario:F19"
pnpm --filter @ens-apps/e2e probe:subname-transfer
SHAPE=all-powers pnpm --filter @ens-apps/e2e seed:subname-transfer
```

`e2e/.env` keeps `E2E_MOCK_INDEXER=true` (matching `.env.ci`), but note the
portal fixture installs **no** indexer mock — only the manager one does. Portal
tests therefore run against real Panoptes, and a fresh fork needs it to finish
backfilling before the harness gate passes.
