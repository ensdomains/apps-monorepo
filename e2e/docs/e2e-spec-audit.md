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

**⚠ The fix is UNVERIFIED.** All three F1 variants fail before reaching it — see
below. Rule 7 forbids claiming a run that was not observed, so F1 is recorded as
`STRENGTHENED` on inspection, **not** as verified green.

### The R0 terminal rows do not currently pass

Running F1 produced three failures, all `TimeoutError` on `locator.click` /
`locator.fill` at the Transfer link and the recipient field — i.e. long before
the assertion added above. (The error *type* is what rules the new assertion
out: it is an `expect().toBe()`, which fails as an assertion error, never as a
locator timeout.) Iteration 3 separately verified the same locator family
failing at `transfer.spec.ts:687` under `--no-deps`, with no harness project
running, so this is **pre-existing and not caused by the audit**.

The consequence is bigger than F1:

> The reconciler's default evidence mode is **static** — `PASS` means "a
> committed, non-skipped test exists and a project config runs it", *not* "it
> passed". It says so in its own report header.

So the ledger's six R0 terminal rows are static-evidence claims for tests that,
run today, fail. That is not a reconciler bug — it is the documented meaning of
static mode, and precisely the gap `--results` exists to close. But it means
**the terminal count of 40 overstates what currently passes**, and nobody should
read R0 6/83 as six working transfer scenarios.

Not triaged further here: whether the portal transfer UI regressed, whether the
locators drifted, or whether it is environmental. That is a batch of its own and
it belongs to R0 proper, not to B4. Recorded rather than chased so the next
iteration starts from the fact instead of rediscovering it.

**Recommended next step for whoever picks this up:** run the portal suite with
`--reporter=json` and feed it to `pnpm e2e:coverage --results <file>`. That
converts every static PASS into a run-verified one and will show exactly how
much of the 40 is real. Do that *before* trusting any tier number.

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
