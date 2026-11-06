# Claude-in-Chrome QA prompt — PR #1017 `feat(manager): migrate names directly through HCA`

You are QA-testing the ENS Manager migration flow in a real browser. Work through the steps
below **in order** and report a table of PASS/FAIL per scenario with the evidence you actually
observed. Do not infer a result you did not see on screen.

Branch under test: `migration-hca` merged with `origin/main` (commit `30af264d0`).
Manager: `http://localhost:3000`. Anvil Sepolia fork: `http://127.0.0.1:8545`.
Wallet: Anvil account 0 `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (mock wallet, auto-signs).

---

## Step 0 — MANDATORY reset, do not skip

Confirmation counts depend **entirely** on leftover fork state. Without a reset the whole matrix
produces plausible-but-wrong numbers. In terminal:

```
node e2e/qa-reset.mjs
```

Do not proceed unless it prints:

```
HCA deployed             : false
BaseRegistrar -> helper  : false
NameWrapper   -> helper  : false
ETHRegistry   -> HCA     : false
```

The HCA address must be `0x48B9c6898baFc8A3D3a495BF7c44CF3351486628`. If you see
`0x0534…` the app is still on the old contracts-v2 #388 implementation and this prompt does not
apply — stop and say so.

Re-run `node e2e/qa-reset.mjs --report` any time you need to re-read the state without changing it.

## The oracle — how to know a scenario passed

The expected number of wallet confirmations is **computable**, not a judgement call:

```
N = D + A_base + A_wrap + A_reg + B + C

D      = 1 if the HCA is not yet deployed          -> row "Create migration account"
A_base = 1 if any unwrapped name is selected and BaseRegistrar->MigrationHelper is not approved
         and at least one selected token lacks its own approval
           exactly 1 token missing -> row "Approve <name>"        (per-token, consumed on transfer)
           2 or more missing       -> row "Approve <k> registrations" (operator, persists)
A_wrap = 1 if any wrapped name is selected and NameWrapper->MigrationHelper is not approved
                                                    -> row "Approve wrapped names"  (persists)
A_reg  = 1 if a selected name's V1 manager != registrant and ETHRegistry->HCA is not approved
                                                    -> row "Approve manager restoration"
B      = number of atomic batches (>1 -> rows "Upgrade batch i of n")
C      = 1 if A_reg applied                         -> row "Revoke temporary HCA access"
```

**Do not** use "footer count equals dialog row count" as a check. Both render the same array, so
they can never disagree — it proves nothing. Use these two instead:

- **O1** — compute N from the reset/report output *before* clicking, then compare to the rendered
  "Expected: N wallet confirmations" and to the ordered rows inside that dialog.
- **O2** — the wallet's transaction count must increase by exactly N across the run. Read it before
  and after:
  ```
  cast nonce 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://127.0.0.1:8545
  ```
  Sample it **after seeding** — the dev panel registers names from this same account, so a
  pre-seed reading counts seeding transactions as confirmations. Also let the fork go quiet before
  sampling: if an earlier bulk seed is still being mined, its `register` transactions land inside your
  window and inflate the delta. If a delta looks wrong, list the wallet's transactions in the block
  range and decode them before calling it a bug.

  **The step→transaction mapping, verified on-chain — do not re-derive it by guessing:**

  | dialog row | to | selector |
  |---|---|---|
  | Create migration account | `0x900FF7cF617Ef9D802178B4ef480491e3A782672` (StandaloneHCAFactory) | `0x1b3671bf` |
  | Approve `<name>` | BaseRegistrar `0x57f1887a…47eA85` | `0x095ea7b3` (`approve`) |
  | Approve N registrations / wrapped names | BaseRegistrar / NameWrapper | `0xa22cb465` (`setApprovalForAll`) |
  | Upgrade N names | the HCA `0x48B9c689…86628` | `0xf9056eaa` (`executeByOwner`) |

  Every row is its own transaction, including HCA deployment. A fresh-HCA single-unwrapped run is
  exactly **3** transactions at consecutive nonces. The HCA's bytecode becomes non-empty in the
  **factory-deploy** block, *not* in the `executeByOwner` block — verified by sampling
  `eth_getCode(hca, <block>)` across the window. If you conclude the deployment was "folded into"
  the upgrade, you have mis-attributed the block; re-check per-block.

## Seeding test data

`http://localhost:3000/dashboard` → **Open ENS dev tools** → **Migration** tab. Click a preset chip
to create a real V1 name on the fork. Presets: `Unwrapped`, `Wrapped`, `Locked`, `Locked+All`,
`Grace Period`, `Grace RW (wrapped)`, `Grace RW (unwrapped)`, `Emancipated`, `Managed`.

Use **Remove selected** to clear the active list between scenarios, then **Migrate All (n)** to go
to `/migration` with exactly the names you seeded.

## Two selector traps

1. A **"Verify your wallet"** modal `aria-hidden`s the page. Dismiss it with **Skip for now** →
   **Skip Anyway**. Until it is gone, every control reads as absent.
2. The CTA displays `UPGRADE 1 NAME` but its text content is `Upgrade 1 name` (CSS uppercase).
   Match case-insensitively.

---

## Scenarios

Run A1→A8 **in one browser session, in order, without resetting between them.** The whole point is
that state carries over and the counts drop as approvals accumulate. Resetting mid-matrix
invalidates every later expectation.

| # | Seed | Expected rows, in order | N |
|---|------|-------------------------|--:|
| A1 | `Unwrapped` | Create migration account · Approve `<name>` · Upgrade 1 name | 3 |
| A2 | `Unwrapped` | Approve `<name>` · Upgrade 1 name | 2 |
| A3 | `Unwrapped` ×2 | Approve 2 registrations · Upgrade 2 names | 2 |
| A4 | `Unwrapped` | Upgrade 1 name | 1 |
| A5 | `Wrapped` | Approve wrapped names · Upgrade 1 name | 2 |
| A6 | `Locked` | Upgrade 1 name | 1 |
| A7 | `Wrapped` + `Unwrapped` | Upgrade 2 names | 1 |
| A8 | `Emancipated` | Upgrade 1 name | 1 |
| A9 | `Wrapped` ×2 | Approve wrapped names · Upgrade 2 names | 2 |

Each must end with the success state ("…has been upgraded!").

**A2 vs A4 is the crux.** A2 must ask for an approval again (per-token approvals are consumed by
the transfer). A4 must ask for none (the operator approval from A3 persists). If A2 shows 1, token
approvals are leaking. If A4 shows 2, operator approvals are not persisting.

### Subnames, hierarchies and records

Use the three purpose-built presets. Each writes real V1 state on Anvil and injects the matching
subgraph data, so these are genuine fixtures, not display tricks.

| # | Seed | Expect |
|---|------|--------|
| N1 | `Records` | `UPGRADE 1 NAME`. After migrating, the name's profile must show description **"QA migration fixture"** and ETH address **`0x70997970C51812dc3A010C7d01b50e0d17dc79C8"`** — those were written to its V1 resolver, so their presence on V2 is record replay working |
| N2 | `Subname` | `UPGRADE 2 NAMES` — the locked 2LD **and** `sub-<label>.<label>.eth`. Both must migrate, and both must come back from the indexer owned by `0xf39fd6e5…b92266`. This is the only way to exercise parent-first ordering and descendant `WrapperRegistry` routing |
| N3 | `Subname+Rec` | `UPGRADE 2 NAMES`, and **both** names show the replayed description and ETH address afterwards |

Confirm the child really is a V2 name rather than just rendered:

```
curl -s -X POST http://127.0.0.1:5655/graphql -H 'content-type: application/json' \
  -d '{"query":"{ domains(where: {name: \"sub-devNNNN.devNNNN.eth\"}) { name owner { id } } }"}'
```

Two things to know:

- **`Emancipated` is not a subname test.** It creates a real child on-chain but offers only the
  parent — it is "a locked 2LD with a locked child". Use `Subname` for the hierarchy.
- **Record replay only happens for a *recognised* resolver.** `resolverStrategyFor` returns
  `to-owned-permres` (replay) only when the V1 resolver is in `KNOWN_PUBLIC_RESOLVERS`; anything else
  gives `keep-v1`, where V2 points back at the old resolver and nothing moves. The record presets
  deliberately use `0x8FADE66B…5B7dD`, which is on that list. If you see no records replayed, check
  the resolver before reporting a bug.

### M1 / M2 — manager restoration (the branch nothing else reaches)

| # | Setup | Expected rows | N |
|---|-------|---------------|--:|
| M1 | seed `Managed` | Approve manager restoration · Upgrade 1 name · Revoke temporary HCA access | 3 |
| M2 | grant ETHRegistry→HCA first, then seed `Managed` | Upgrade 1 name | 1 |

For M2, pre-grant the approval in terminal (impersonated):
```
cast rpc anvil_impersonateAccount 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://127.0.0.1:8545
cast send <ETHRegistry> "setApprovalForAll(address,bool)" 0x48B9c6898baFc8A3D3a495BF7c44CF3351486628 true \
  --from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --unlocked --rpc-url http://127.0.0.1:8545
```

**Report explicitly how many confirmations manager restoration costs.** The PR body says a missing
ETHRegistry approval "adds one confirmation". If you see both an "Approve manager restoration" row
and a "Revoke temporary HCA access" row, it costs **two**, and the PR body needs correcting.

After M1, verify the approval was actually revoked — it must read `false` again:
```
cast call <ETHRegistry> "isApprovedForAll(address,address)(bool)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 0x48B9c6898baFc8A3D3a495BF7c44CF3351486628 \
  --rpc-url http://127.0.0.1:8545
```

### C1 — continuation after fresh HCA deployment

Reset, seed one `Unwrapped`, start the migration, and confirm the "Create migration account" step.
**Watch what happens immediately after that first confirmation.** The flow must continue into the
approval and upgrade steps. If it returns to the name-selection screen, that is a FAIL — keeping the
migration alive across the post-deployment smart-account refresh is one of this PR's stated goals.

### G1 — multi-batch: DO NOT ATTEMPT, it is blocked by tooling

Skip this and report it as untestable. Measured on this fork: ~80k fixed gas + ~195k per name, so the
20,000,000 planning cap needs **~102 names in one selection**. The dev panel cannot carry that many —
it persists the active list in a **single 4096-byte cookie**, which holds exactly **29** names, and
its counter keeps showing the in-memory total while silently dropping the rest. Seeding 110 names
renders `Upgrade 29 names`.

If you want to confirm the cap: seed 30+, then compare the panel's `Migrate All (n)` count against
the CTA on `/migration`. They will disagree above 29.

### Edge cases

| # | Case | Expected |
|---|------|----------|
| E1 | no names seeded | "No eligible names found for this wallet"; CTA `UPGRADE 0 NAMES` **disabled**; no fee line and no confirmations link at all |
| E2 | `Locked+All` | Report what happens. If it comes back "No eligible names found" for a name you explicitly seeded, record it as a finding and quote the exact copy — the page should say *which* name was dropped and why |
| E3 | `Grace Period`, `Grace RW (wrapped)`, `Grace RW (unwrapped)` | Excluded is **correct** (expired and unrenewed). Only flag it if the UI misleads — e.g. claims to migrate then fails |
| E4 | visit `/migration?names=definitely-not-owned-xyz123.eth` | no crash; the name is excluded |
| E5 | seed one name, then deselect it on the migration page | CTA disables and the fee line disappears |

### Regression — these share code with the change

| # | Case | Expected |
|---|------|----------|
| R1 | register a new name via `/register` | Still completes. Shares the HCA address derivation, the contracts-v2 #409 validator, and the `ens-sessions-v9` session key — the likeliest breakage |
| R2 | open a V2 name's profile → **Edit profile** → change a record → **Save** | Still completes. This runs `setupControlledResolver` → `ensureOwnedPermRes`, a module this PR deleted and the merge restored, so it specifically validates that resolution. Also try **Choose Primary Name** on the dashboard, which uses the same path |
| R3 | migrated name reaches the indexer | **Do not text-search the dashboard** — the OWNED list is virtualized, so with dozens of names only the first rows are in the DOM and a present name reads as absent. Query the indexer instead: `curl -s -X POST http://127.0.0.1:5655/graphql -H 'content-type: application/json' -d '{"query":"{ domains(where: {name: \"<name>.eth\"}) { name owner { id } } }"}'` and expect `owner.id` = `0xf39fd6e5…b92266` |
| R4 | a migrated name's profile page | **Owner** is the connected wallet `0xf39F…2266`, not the NameWrapper and not the HCA. This is the PR's headline claim. Wait for the indexer — immediately after migration the page can still show pre-index V1 state |
| R5 | the success dialog | Renders, and its CTA lands on the dashboard |

### Viewport

Repeat A4 (a 1-confirmation scenario, so it is quick) at **375×812**. The sticky footer must stay
reachable and the CTA must not be clipped or overlapped.

---

## Reporting

Produce one table: scenario · predicted N · rendered N · rows matched? · run result · nonce delta ·
verdict. Then list findings separately, each with the exact on-screen copy or command output that
supports it.

Rules:
- If a prediction and the render disagree, **re-read the chain state before calling it a bug** — a
  stale precondition is by far the most common cause of a false failure.
- Never report a scenario as passing if you did not watch it reach the success state.
- If something is untestable with the current tooling, say "untested" — do not present it as a pass.

## If the indexer looks broken

Symptom: `processed 0, skipped N (unknown contracts)` on every batch and no `Migration detected`
lines. Check whether the config bind-mount went stale — Docker binds
`e2e/infra/panoptes/contracts.json` by **inode**, so any `git stash`/`git checkout`/editor
save-by-replace on that file leaves the running container pointing at a deleted file:

```
docker exec infra-panoptes-indexer-1 md5sum /app/config/contracts.json   # errors if broken
docker restart infra-panoptes-indexer-1 infra-panoptes-api-1             # re-binds
```

The indexer resumes from the chain head, so anything migrated while it was broken is **not**
backfilled — re-migrate a fresh name rather than looking for the old ones.

## Already-known, do not re-report as new

- `Revoke temporary HCA access`, `Remove the temporary permission after the upgrade.` and
  `Your names were upgraded, but temporary HCA access still needs to be revoked.` are missing from
  the `en` message catalog (never extracted). They render in English anyway.
- Non-`en` locales are largely untranslated app-wide (sv 33/789 strings, de/es/ru 109/647), so the
  migration copy appearing in English under `de`/`es`/`ru`/`sv` is pre-existing, not this PR.
- The explorer reports every name as "available" (a portal/ensjs `getAvailable` problem), so
  migrated names do not show there.
- Playwright's `e2e/helpers/mock-v1-subgraph.ts` intercepts the wrong subgraph URL, so the
  `migration*.spec.ts` suite sees zero eligible names.
- Unit tests need `NODE_OPTIONS="--localstorage-file=/tmp/ls.json"` on Node 26, which otherwise
  shadows happy-dom's `localStorage` and fails 44 tests repo-wide.
