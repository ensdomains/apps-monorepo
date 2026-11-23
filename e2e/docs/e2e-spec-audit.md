# Inherited spec audit — goal §6 B4

> There are ~16 spec files already in `e2e/projects/**`. Some are excellent, some
> assert on text where chain state was available, and at least one suite was
> passing for weeks while the fixture under it wrote to contracts the app never
> reads. Existing tests are **unaudited inheritance** until you have checked each
> against §5. Do not count them as coverage before then.

This file is the record of that check. One section per spec file, one row per
tagged scenario. A row is only `AUDITED` once someone has read the test against
§4's oracle hierarchy and §5's ground rules and written the verdict here.

**Scope note.** Only *tagged* tests matter for the ledger — an untagged test
claims no coverage, so it cannot make a false one. Untagged specs are listed at
the bottom for completeness but are not audit-blocking.

## Verdicts

| Verdict | Meaning |
|---|---|
| `KEEP` | Meets §4. The tag is honest. |
| `STRENGTHENED` | Met §4 only partially; assertions **added** (never weakened) and the tag kept. |
| `DEMOTE` | Does not meet §4 and cannot be fixed cheaply. Tag removed, scenario returns to not-started. |

---

## R0 · `portal/tests/transfer.spec.ts` — audited 2026-08-12

Six tagged scenarios. **Five keep, one strengthened, none demoted.**

| # | Test | Oracles used | Verdict |
|---|---|---|---|
| **F1** | `transfers a migrated {unwrapped,unlocked} V1 name`, `transfers a migrated locked V1 name …` | rank 1 `ownerHasRole` precondition; rank 1 `readResolverAndSubregistry` before/after on the locked variant; **rank 2 exact transaction ids** via `driveTransactionsToSuccess([…detach-resolver, …transfer-token])`; rank 5 switch state | **STRENGTHENED** |
| **F2** | `does not offer transfer for a name with CANNOT_TRANSFER burnt` | rank 1 `assertLacksRoles(owner, [ROLE_CAN_TRANSFER_ADMIN])`, plus the reason string | KEEP |
| **F3** | `does not offer transfer for a subname` | rank 5/6 only — but the catalogue's own oracle is *"currently unsupported — assert the explicit copy"*, so the copy **is** the assertion, which §4 rank 6 expressly permits | KEEP |
| **F4** | `refuses to transfer an expired name` | rank 1 `assertRoleBitmap(owner, [])` + reason string | KEEP |
| **F5** | `surfaces an error when the recipient cannot receive the token` | rank 1 `ownerOfName` after the attempt; rank 1 resolver read before | KEEP |
| **F7** | `hands the full role set to the recipient and leaves the sender none` | rank 1 `assertRoleBitmap` for **both** parties, before and after | KEEP — exemplary |

### F1 — what was wrong

F1's final postcondition went through `expectOwnerOnNamePages()`, which asserted
ownership **entirely in rendered text**:

```ts
const shortenedOwner = `${ownerAddress.slice(0, 6)}…${ownerAddress.slice(-4)}`
await expect(page.getByText(shortenedOwner).first()).toBeVisible(…)
```

That is verbatim the example §4 gives of what does not count — *"The page says
Owner: 0xabc is not evidence the token moved."* And `ownerOfName()` was already
defined in the same file, thirty lines above, used by exactly one test (F5).

F1 was not worthless: its rank-2 transaction-id assertion proves the plan
executed as the two steps `buildTransferPlan` should produce, and the locked
variant's before/after subregistry read is the real E2E-001 regression guard. It
simply never confirmed on chain that the recipient ends up owning the token.

**Fix:** a chain `ownerOf` assertion at the top of `expectOwnerOnNamePages`,
before any page assertion. Additive — every existing assertion is untouched, per
rule 1. The helper is shared, so the untagged transfer tests gained it too.

**VERIFIED 2026-08-12.** All three F1 variants pass against the corrected
environment, with the new chain assertion in the path. (They failed on the first
attempt, but for an environmental reason — the portal was compiled against public
Sepolia and could not see the fixture's names. See `coverage/handoff.md` 7a.)

### On the "R0 does not pass" claim made here earlier

It was wrong, and it is worth preserving why. I observed three F1 failures, and
concluded the ledger's static PASSes were hollow. The failures were real; the
inference was not. The tests were fine — the app was on the wrong chain.

Re-run: **58 passed, 1 failed, 3 skipped**. The one failure is F5's regression
test for open S1 E2E-002, which is supposed to be red. `pnpm e2e:coverage
--results` reports 40/300 and exits 0, so every static PASS is now a verified
PASS.

The generalisable mistake: I treated "the test failed" as evidence about the
*test*, without first establishing that the environment under it was sound.
Run-verification is only as good as the environment it ran in, which is why the
harness now asserts the apps' RPC wiring before anything else.

### Methodology note — do not repeat this mistake

I nearly filed F2 as a finding. A grep for `expect|ownerHasRole|assertRole|
getByText` missed `assertLacksRoles`, so the test looked text-only when it in
fact opens with a rank-1 chain read.

**Grep-based auditing systematically under-reports chain assertions**, because
the chain read is usually behind a domain-named helper (`assertLacksRoles`,
`assertRoleBitmap`, `readResolverAndSubregistry`, `ownerHasRole`,
`driveTransactionsToSuccess`) rather than a literal `readContract`. Read the
test body. If you must grep, grep for the *helpers* first and build the pattern
from what the file actually imports.

---

---

## ⚠ The R2 measurement below is VOID — 2026-08-12

The run it is based on was taken while **the portal was compiled against public
Sepolia**, not the local fork (`apps/portal/.env` had lost its local-dev values
to an untracked `.env.bak-loop`). Every fixture name was invisible to the app,
so the failures say nothing about the specs and the passes say less: all seven
survivors were negative assertions, true only because the app could not see the
name.

Corrected and re-run: **58 passed, 1 failed, 3 skipped** in 8.9 minutes, and the
single failure is F5's committed regression test for open S1 E2E-002, which is
supposed to be red. The table below is kept only so the void numbers cannot be
mistaken for current ones.

**The R2 verdicts remain outstanding.** A green run is not an oracle review — a
test can pass on a weak assertion. `roles.spec.ts`, `subnames.spec.ts`,
`resolver.spec.ts` and `records.spec.ts` still need reading against §4. They now
have a much better prior, since they do read bitmaps and records back on chain,
but that is an impression rather than an audit.

**The method still stands, and so does its lesson — with one addition:** run the
suite before auditing it, *and verify the app under test is on the right chain
before believing the run*. A green negative assertion is the cheapest thing in
the world to produce by accident.

## R2 · ~~audited by measurement~~ **(VOID)** — 2026-08-12

The four portal files below were going to be read one by one. A full suite run
with `--results` answered the question faster and with better evidence: a test
that fails when executed is not coverage, whatever its assertions look like.

**41 of 61 failed.** R2 repriced **26 → 5**, R0 **6 → 4**, total **40 → 17**.

| File | Tagged | Observed |
|---|---|---|
| `roles.spec.ts` | C1, C2, C3, C4, C5, C7, C8, C9, C11, C12 | C7, C8, C9 pass; the rest fail |
| `subnames.spec.ts` | D1–D6 | D4 passes; the rest fail |
| `resolver.spec.ts` | E3, E6, E7, E8, E10, E11 | E7 passes; the rest fail |
| `records.spec.ts` | E1, E2, E4, E5 | all fail |
| `transfer.spec.ts` | F1–F5, F7 | F2, F4 pass; F1, F3, F5, F7 fail |

**Every survivor is a negative or read-only assertion.** Every failure drives a
write through a UI form and dies on a control that never appears — 12 of them on
`getByPlaceholder('ENS name or address')` alone.

So these specs are **not** individually audit-failing in the §4 sense. The
oracle quality of `roles.spec.ts` (which reads bitmaps on chain) and
`records.spec.ts` (which reads records back on chain) looked good on inspection.
They fail for an environmental reason that no amount of assertion review would
have found — which is itself the lesson: **run the suite before auditing it.**
A static read of these files would have concluded "26 R2 rows are solid" and
been wrong in the most expensive direction.

Their verdicts are therefore **deferred, not decided**. Re-run once the portal
write UI is working; only then is a §4 reading of the surviving failures
meaningful. See `coverage/handoff.md`, iteration 7, for the blocker and the
parked ratchet ruling.

## Not yet audited

Blocking the ledger's remaining terminal claims. In tier order.

| Tier | File | Tagged scenarios |
|---|---|---|
| R2 | `portal/tests/roles.spec.ts` | C1, C2, C3, C4, C5, C7, C8, C9, C11, C12 |
| R2 | `portal/tests/subnames.spec.ts` | D1, D2, D3, D4, D5, D6 |
| R2 | `portal/tests/resolver.spec.ts` | E3, E6, E7, E8, E10, E11 |
| R2 | `portal/tests/records.spec.ts` | E1, E2, E4, E5 |
| R1 | `manager/tests/registration.spec.ts` | A16 |
| R1/R3 | `manager/tests/profile.spec.ts` | B2, H7 |
| — | `manager/tests/migration.spec.ts` | A11 (excluded by config — see below) |

**26 of the ledger's 40 terminal rows are R2 and rest on the four portal files
above.** They are the largest single block of unaudited inheritance and should
be the next B4 batch.

### Untagged — claim no coverage, not audit-blocking

`manager/tests/{migration-fuses, migration-premium, notification, primaryName,
registration-rhinestone, temporaryPremium}.spec.ts`,
`portal/tests/{registration, temporaryPremium}.spec.ts`.

Two of these are untagged *deliberately*, by the iteration-1 audit:
`migration-premium.spec.ts`'s baseline test and `migration.spec.ts`'s
post-migration edit both failed to meet their candidate rows' oracles (GW3, GU4)
and carry comments saying so.

### Config exclusion — trap #6, live

`projects/manager/playwright.config.ts` carries
`testIgnore: /temporaryPremium|migration|notification/`. That is why `A11` shows
as `excluded` in the reconciler: a committed, tagged test that **no config
runs**. It is the goal's own trap #6 ("Coverage number looks fine; whole areas
never execute"), currently active, and it needs a decision — restore the
coverage or write the exemption. Note the whole manager project is separately
blocked on the connect flow (see `coverage/handoff.md`, iteration 4), so this
cannot be resolved by simply deleting the ignore.
