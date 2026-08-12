# E2E build — iteration handoff

The file `/e2e-goal` reads first. One section per iteration, newest at the top.
`In flight: nothing` is the goal.

---

## Iteration 11 — 2026-08-12 · all-must-pass semantics · **BLOCKED on infra**

**Batch:** make a scenario PASS only when *every* covering test passes, then tag
the multi-case rows that semantic unblocks.

**Landed and verified:** the reconciler change. `A16` now correctly reads
`1/2 covering test(s) did not pass: "registers a name after connecting from the
pricing page" (failed)` — a partial regression the old "best outcome wins" rule
had been hiding.

**Landed but NOT verified:** `F10` (six recipient forms) and `F13` (non-owner
and disconnected visitor), tagged across their per-case tests. Honest to tag
only because of the semantic above; before it, six per-case tags would have made
F10 green on one input.

**Ratchet held at 42**, not the 44 static now reports. The verification run died
on `ECONNREFUSED 127.0.0.1:8545` — ten tests "failed" in 25 seconds against no
chain. Rule 7 forbids claiming a run I did not observe.

### BLOCKER — the e2e infra stack is gone

Every `infra-*` container is **removed**, not stopped — `docker ps -a` shows no
`infra-anvil-1` at all. This happened outside the loop. Nothing that touches the
chain can run until it is back.

`pnpm e2e:infra:up` restores it, but it creates a **fresh fork**, discarding the
accumulated chain state — including the ~29-day clock drift, which is arguably
a bonus. That is the repo owner's call, so it was not done here.

**First thing after infra returns:**

```
pnpm exec playwright test --config=projects/portal/playwright.config.ts   --project=portal-e2e --grep "@scenario:F1[0123]" --reporter=json --workers=1
pnpm e2e:coverage --results <file>          # then raise the ratchet to 44
```

### R1 is verifiably 0, and deliberately not lowered

Both `A16` and `B2` fail, so R1's true value is 0 against a baseline of 2.
Not lowered: `A16`'s failing test is a *registration* test, so it shares the HCA
session root cause diagnosed in iteration 9 and already escalated. Baking a
demotion into the ratchet for a known, external, in-flight cause would be wrong.
It should recover on its own once the smart-account fix lands.

---

## Iteration 10 — 2026-08-12 · first real scenario batch

**Batch:** R0 · audit the ten untagged `transfer.spec.ts` tests against F9–F13.

**Result:** 2 tagged (**F11**, **F12**) · 1 strengthened · 3 rows deliberately
left untagged. **R0 6 → 8**, ratchet raised. Both verified green by observed
runs, not static evidence.

- **F12** needed nothing — it already reads the resolver back off the registry
  and asserts `addr(60) == recipient`, exactly the catalogue oracle.
- **F11** verified its record write with `getByText`, i.e. the rendered value,
  which only proves the form echoed what was typed. Now reads `text()` off
  chain.

### F11's first fix looked like a defect and was not

The chain read initially used ensjs `getTextRecord` and failed — apparently
"the new owner cannot write", which would have been a real S2. It was my
instrument. Checked by hand against a name from an earlier run:

```
registry resolver    = 0xcE06b938…
resolver.text direct = "Edited by the new owner"     ← the write landed
ensjs getTextRecord  = ERR TypeError                 ← the helper is wrong here
```

`getTextRecord` resolves through the Universal Resolver, which does not answer
for the resolver this test freshly deploys. Reading the resolver directly is
also the higher oracle — it depends on nothing but the two contracts the
assertion is about.

**Third time this session** that a red test was not evidence about the app
(after the portal-on-public-Sepolia run, and the "R0 is hollow" inference).
Establish the instrument before believing the reading.

### F9, F10, F13 — untagged on purpose

They are **multi-case matrices** in the catalogue and the existing tests cover
one case each. F10 alone names six recipient forms (ENS name, address,
whitespace, self, zero address, unresolvable) and there is a passing test for
each — but the reconciler marks a scenario PASS when **any one** covering test
passes, so six per-case tags would make F10 green on a single input. That is
precisely the partial tag rule 2 forbids.

Unblocking them needs one of:

1. a consolidated test per row, or
2. **an all-must-pass reconciler semantic** — a scenario is PASS only when every
   covering live test passes.

Option 2 is the better fix and also closes the hole found in iteration 9, where
`A16` stays green because one of its two tagged tests passes while the other
fails. It is a change to PASS semantics, so it will demote whatever is currently
carried by a partial pass — a scope change worth doing deliberately rather than
mid-batch.

### Ratchet note

Raised on the **static** run, so `R1` stays at its pre-existing 2 while the
verified value is 1 (`B2` genuinely fails — iteration 9). That staleness is
already parked, not newly introduced here; `R0 6 → 8` is the real movement and
is backed by observed green runs of both tests.

---

## Iteration 9 — 2026-08-12 · manager repriced, and registration diagnosed

**Manager suite verified.** 18 tests: 12 passed, 5 failed, 1 skipped, ~40 min.
With both suites' results: **terminal 39/300**, and the ratchet fires on
**R1 2 → 1** — a real demotion this time, not an environment artefact.

Manager-side failures:

| Test | Duration | Tag |
|---|---|---|
| sets the newly registered name as primary | 249s | — |
| registers a name via Rhinestone HCA | 249s | — |
| registers a name after connecting from the pricing page | 188s | A16 |
| extend unowned name by 28 days | 103s | **B2** |
| agent-registration record card | 29s | — |

`A16` survives because it is tagged on two tests and one passes — the
reconciler's documented "best outcome wins". Worth knowing: **a scenario tagged
on several tests goes green on any one of them**, so a partial regression is
invisible at the tier level. `B2` had only one test and correctly demotes.

### Duration is a hang detector, and it is free

The distribution is bimodal with a clean gap: **everything passing ≤26s,
everything failing ≥29s**, with the top three at 188–249s. Those three are all
registration-dependent and were each burning a full timeout waiting on a
registration that never completes — **11.4 minutes of the 40-minute run spent
waiting for one upstream failure.**

Any test whose duration approaches its configured timeout is waiting for
something that never arrived, which looks nothing like doing a lot of work.
Cheap check, and it is what turned "five unrelated failures" into "one cause and
its three victims".

### Registration (HCA) — diagnosed, not fixed

Reproduces in isolation, so it is not cross-test interference.

**Ruled out**, each with evidence:

- *Stale selector* — my first guess. `locator('p.text-ens-peridot-text-dark')`
  looks brittle, but the banner is absent because there is no success.
- *Orchestrator down* — mockestrator's 503 on `GET /` is just its unmapped-route
  reply (`{"error":"Not implemented!"}`). Docker: up, healthy.
- *Chain stalled* — automine on, blocks advancing, zero pending transactions.
- *Funding* — HCA holds 10 ETH and 10 000 USDC; executor EOA holds 1e9 ETH.
- *Address drift* — commit and read both use
  `ENS_SEPOLIA_CONTRACTS.ETHRegistrar` = `ensjsSepolia.ensEthRegistrar.address`.

**The actual mechanism:**

1. `tx-reg-commit` cycles `submitting → retrying` three times, then `error`.
2. The mockestrator logs, at the same moment, an `IntentExecutor` call
   reverting — `to: 0x8a525dc484f893ca64fef507746ebd5036eec256`, value 0,
   selector `0x8b10923e`, `execution reverted` / *"Execution reverted for an
   unknown reason"*. The intent payload carries the `commit` call
   (`0xf14fcbc8`).
3. Downstream, `registration.actors.ts:744` polls `commitmentAt()` five times
   with 3s backoff, gets `0n` each time, and throws the message the UI shows:
   *"Commitment timestamp not recorded after multiple attempts."*

So the UI message is a **symptom two layers below its cause**. Nothing is wrong
with the commitment polling; the intent that would have written the commitment
reverted inside the executor.

### Root cause — the HCA session is never enabled

Followed `DEBUGGING_INTENTS.md` §2 and replayed the intent. The trace bottoms
out exactly where §1 says it will:

```
0x5f249FCa…::isValidSignatureWithSender(…)          ← HCAOwnerAndSessionValidator
  ├─ HCA::ownerAndSessionNonce() → (0xf39f…2266, 0)
  └─ ← [Revert] 0x9bdfc59f                          ← the real error
     → returns 0xffffffff
  ← [Revert] 0x8baa579f  InvalidSignature()         ← the wrapper §1 warns about
```

| fact | value |
|---|---|
| inner error | `0x9bdfc59f` = **`InvalidSessionData()`** — *"payload is not the Smart Session USE form"* (§3 table) |
| mode byte `data[0]` | **`0x05` = `FIXED_SESSION_REFUND_ENABLE_MODE`** — same-chain first use, *carries the proof* |
| permissionId `data[1:33]` | `0xfd53396b5143242c0a1114e2ccd39a52ee7830fd19cf39ebee2d1530f86b2810` |
| `isPermissionEnabled(hca, permissionId)` at `latest` | **`false`** |
| `ownerAndSessionNonce()` | owner `0xf39f…2266`, nonce **0** |

So the app *is* doing the §7 thing correctly — mode `0x05` means the
session-enable proof is attached. The failure is one level in: the validator
rejects the session payload as not being in Smart Session USE form, the session
therefore never gets enabled, and **every** registration fails at its first
commit.

**This is not the intermittent bug §7 describes.** That one has the signature
"`false` at the failing block, `true` at `latest`". Here it is `false` at
`latest` too — the session is never enabled at all, so this is deterministic and
reproduces on every run, which matches what is observed.

Reproduce in one command (no fork or archive RPC needed — the failing state is
the local chain):

```bash
docker logs --since 10m infra-mockestrator-1 2>&1 \
  | grep -aoE 'data:   0x8b10923e[0-9a-f]+' | tail -1 | sed 's/^data:   //' > /tmp/intent.hex
cast call 0x8a525dc484f893ca64fef507746ebd5036eec256 "$(cat /tmp/intent.hex)" \
  --from 0x1aF50037fFD325FBC96A2BEFCf4b0d13c94Df0e8 \
  --rpc-url http://127.0.0.1:8545 --trace
```

**Where the fix belongs:** `packages/smart-account`, in how the fixed-session
payload is packed for `0x05` mode — §3's note applies, *"a trace only ever
reveals the first violation"*, so re-check the remaining calls against the
policy loop after fixing this one. That is app work and explicitly out of scope
for the test-building loop (§12), so it is handed over rather than attempted.

Not filed in `e2e-defects.md`: `registration-rhinestone.spec.ts` is untagged, so
a defect row naming `A2` would trip the reconciler's `defect-unproven` failure.
Recorded here instead, same as the `0x640294a2` finding.

---

## Iteration 8 — 2026-08-12 · the real numbers

Portal suite re-run against the corrected environment.

```
                    run 1 (bad env)   run 2 (fixed)
  passed                  17               58
  failed                  41                1
  skipped                  3                3
  duration               2.0h             8.9m
```

**`pnpm e2e:coverage --results` now reports 40/300 and exits 0.** Same number as
static mode — which is the point: every static PASS is now a *verified* PASS,
not an assumption. The ledger's evidence quality went up without the count
moving.

```
  HW  harness         5/10
  R0  irreversible    6/83    PASS 4 · DEFECT 2
  R1  financial       2/50
  R2  authorization  26/64    ← the 26 are real
  R3  display         1/70
  R4  resilience      0/23
```

**The single failure is correct and should stay red.** `transfer.spec.ts ::
surfaces an error when the recipient cannot receive the token` (F5) fails with
*"the resolver must not be detached for a transfer that cannot complete"* —
that is the committed regression test for open S1 **E2E-002**, doing exactly
what §7 prescribes: app wrong → file the defect, keep the failing test
committed. The reconciler counts F5 as DEFECT, which is terminal.

The 2.0h → 8.9m collapse is the tell: run 1 was 41 tests each burning a 60s
locator timeout against an app that could not see their fixtures.

### What is now settled, and what is not

- **Settled:** the 23 rows I flagged as possibly-stale are fine. No ratchet
  ruling needed. No portal write-UI bug exists. Iteration 7's escalation is
  fully void.
- **Not settled:** B4's R2 audit. Passing is not the same as meeting §4 — a test
  can be green on a weak oracle. Iteration 6's doc claimed R2 was "audited by
  measurement"; that was wrong twice, first because the run was invalid and
  second because a green run is not an oracle review. `roles.spec.ts`,
  `subnames.spec.ts`, `resolver.spec.ts` and `records.spec.ts` still need
  reading against §4. They now have a *much* better prior — they read bitmaps
  and records back on chain — but that is an impression, not an audit.

### Blockers, updated

| Was | Now |
|---|---|
| Portal write UI broken | **resolved** — was the env, fixed by the repo owner |
| Ratchet ruling needed | **withdrawn** — premise was void |
| Manager connect flow (`VITE_FF_USE_EOA`) | `.env` restored; **needs a manager-suite run to confirm** |
| `0x640294a2…` identity | **still open** — owner sugh01, expires 2026-08-18 |
| `makeV1Name` registrar | **still open** — blocks all 61 `G*` rows |

### Next

1. **Run the manager suite** the same way — `--reporter=json` → `--results`. Its
   `.env` was restored too, so the iteration-4 connect blocker may already be
   gone. That reprices R1/R3 on real evidence and is cheap.
2. **B4's R2 slice** — read the four portal files against §4.
3. Then R0 proper: `F` (14 rows) and `I` (6).

---

## Iteration 7a — 2026-08-12 · **CORRECTION to iteration 7**

Iteration 7's diagnosis below was **wrong**, and its numbers are void. Keeping
the section because the method was right and the correction is the lesson.

**What was actually wrong:** `apps/portal/.env` had been reduced to its
committed baseline, and the local-dev values — including
`VITE_SEPOLIA_RPC_URL_SERVER=http://127.0.0.1:8545` and
`VITE_INDEXER_GRAPHQL_URL` — survived only in an untracked
`apps/portal/.env.bak-loop`. **The portal was compiled against public Sepolia.**
It could not see a single name any fixture created on the local fork. The
manager had the same gap in `apps/manager/.env`.

Corrected by the repo owner on 2026-08-12: both `.env` files restored, both dev
servers restarted. Verified — both now serve `http://127.0.0.1:8545`.

**Three things this invalidates:**

1. *"The portal's connected/write UI does not mount"* — no. The app was on the
   wrong chain. Owner-gated forms never rendered because, to the app, the name
   did not exist.
2. *"17 passed"* — inflated. The 7 passing **portal** tests were all negative
   assertions (*shows no role holders*, *does not offer transfer*, *refuses…*),
   which are trivially true when the app cannot see the name. **A confident
   negative is exactly what an app on the wrong chain produces.** That is INV4,
   occurring inside the measurement intended to expose it. Genuinely verified
   was the 10 harness tests and approximately zero portal scenarios.
3. *The ratchet ruling* — no longer needs a human. The 23 rows were never
   evidence of stale tests; they were evidence of a broken environment.

**How it got past B0, and the fix.** B0 checked that Anvil was forked, that the
Panoptes manifest matched `ensL1Contracts[sepolia]`, and that both apps returned
HTTP 200. It never checked *which chain the apps were pointed at*. "The app is
serving" is not "the app is on the right chain" — the same distinction B0 makes
carefully for the indexer, not made for the apps.

Two harness changes close it:

- **`the apps under test are pointed at this fork, not a public RPC`** — new.
  Reads each dev server's own transformed `wagmi` module and requires
  `127.0.0.1:8545`, so it reflects what the running app was built with rather
  than what a file on disk currently says. Fails with a diagnosis, not a
  symptom.
- **`makeName`'s rule-6 oracle was tautological and is fixed.** It asserted
  `getByText(name)` on `/$name` — which passes even when the app cannot resolve
  the name, because the profile header echoes the route param. It now asserts
  the **owner address**, which the app can only know by reading the chain. This
  is §11's tautological-oracle trap, in the suite built to catch that class; it
  was green throughout the bad run. Post-fix it takes 9.3s instead of 4.2s,
  because it is now doing real work.

Harness: **11 passed** against the corrected environment. Full portal re-run in
flight; see iteration 8 for the real numbers.

**Standing lesson:** a harness gate is only worth what its weakest oracle is.
One tautological assertion in it made the entire suite unable to detect that
both apps were talking to the wrong chain.

---

## Iteration 7 — 2026-08-12 · ~~LOOP STOPPED — escalating~~ **(diagnosis void — see 7a)**

**Batch:** reprice the ledger against a real run. Full portal suite,
`--reporter=json`, fed to `pnpm e2e:coverage --results`.

**Result:** the ledger's terminal count was **inflated by 58%**, and both apps'
write paths are blocked in this environment.

```
                     static   observed
  HW  harness           5        5
  R0  irreversible      6        4
  R1  financial         2        2   (manager-side, not in this report)
  R2  authorization    26        5
  R3  display           1        1   (manager-side, not in this report)
  R4  resilience        0        0
  TOTAL                40       17
```

Run: 61 tests, **17 passed · 41 failed · 3 skipped**, 2.0h, single worker.
Report kept at `/tmp/portal-results.json` (288 KB, not committed). Reproduce
with:

```
pnpm exec playwright test --config=projects/portal/playwright.config.ts \
  --reporter=json --workers=1 > /tmp/portal-run.log 2>&1
pnpm e2e:coverage --results /tmp/portal-results.json
```

### The 41 failures are one shape, not 41 bugs

Every test that **passed** is a negative or read-only assertion. Every test that
**failed** drives a write through a UI form, and fails on a form control that
never appears.

Passing portal tests, in full: *refuses to change the resolver without
ROLE_SET_RESOLVER* · *shows no role holders once the name has expired* · *gives
an approved operator the blended role set* · *shows no role holders for a name
that is only reserved* · *does not offer subname creation without
ROLE_REGISTRAR* · *refuses to transfer an expired name* · *does not offer
transfer for a name with CANNOT_TRANSFER burnt*. Plus all 10 harness tests.

Failing locators, top of the distribution:

| n | locator |
|---|---|
| 12 | `getByPlaceholder('ENS name or address')` |
| 5 | roles table — `h3` "parent registry roles" → following rows |
| 4 | `getByLabel('Type', { exact: true })` |
| 3 | `getByRole('link', { name: 'Transfer' })` |
| 2 | `getByRole('button', { name: 'Add user' })` |
| 2 | `locator('#label')` |

Spanning `transfer`, `roles`, `subnames`, `records`, `resolver` — five spec
files, many distinct controls. So not a single drifted selector, but a single
*class*: **the portal's connected/write UI does not mount here, while read-only
and guard paths render fine.**

Note the harness `wallets` test passes, and it asserts the portal header shows
the injected account — so some connection state exists. Whatever is broken sits
between "header knows the account" and "owner-gated forms render". Not triaged
further; that is an app/env question, not test debt, and it is the same class as
the manager's connect blocker from iteration 4.

### The ratchet is doing its job, and it is blocking a correction

`pnpm e2e:coverage --results …` now **fails**:

```
Ratchet regression (baseline may only increase):
  ✗ R0: terminal 6 → 4
  ✗ R2: terminal 26 → 5
```

That is correct behaviour. It also means the repo is in an uncomfortable state
worth naming: **the truthful invocation fails and the flattering one passes.**
Plain `pnpm e2e:coverage` still reports 40/300 and exits 0, because static mode
means "a test exists and a config runs it".

**I did not lower the baseline.** Lowering it is a scope change (§12) and the
honest reading is ambiguous in a way only a human can settle:

- if the portal write UI is *broken*, the tests are fine and the environment is
  the blocker — the baseline should stand and the work is to fix the env;
- if the portal write UI *changed*, the tests are stale and 21 R2 rows plus 2 R0
  rows should genuinely return to not-started.

Guessing either way corrupts the ledger. **Parked: owner sugh01, expires
2026-08-19.**

### Why the loop stopped

Goal §16.4, *No progress*: iterations 6 and 7 both closed with no increase in
terminal count. That is the stop condition, and unlike the earlier bootstrap
iterations it is not covered by §16.6's carve-out — `HW*` did not move either.

Continuing would mean authoring scenario tests against an environment where no
write flow completes. I could not verify any of them, and unverifiable tests
committed as coverage is precisely the failure mode this goal exists to prevent
(§16.5: *claiming a passing run it did not observe*).

### What is needed to restart, in priority order

1. **Portal write UI** — 41 failures, one class. Blocks R0 `F*`, R2 `C*`/`D*`/
   `E*`. Nothing else in the ledger is worth more.
2. **Manager connect flow** — `VITE_FF_USE_EOA=false` (iteration 4). Blocks
   every manager scenario. Flipping it restarts your dev server, which is why I
   did not.
3. **Ratchet ruling** — stand or lower, per the ambiguity above.
4. **`0x640294a2…` identity** (iteration 2) — one address, two contract names.
   Blocks trusting any `GR*` result.
5. **`makeV1Name` registrar** (iteration 4) — blocks all 61 `G*` rows. Proven,
   citable, and `test.fail()`-pinned so it goes red the moment it is fixed.

Work that remains reachable *without* any of the above, if the loop restarts and
you want progress meanwhile: the missing harness modules — **HW4** time-presets,
**HW7** cross-app fixture, **HW8** transaction-ids, **HW9** fault-injection,
**HW10** premigration. Each is a batch and each moves the ledger honestly.

### State at stop

- Bootstrap **B0–B4 complete** (B4's R2 slice audited by measurement rather than
  by reading, which is stronger evidence than the audit would have produced).
- Harness gates green on both projects; address gate green.
- Ledger: static 40/300, **observed 17/300**. Invariant sites 0/32.
- `docs/e2e-spec-audit.md` holds the per-spec verdicts.

---

## Iteration 6 — 2026-08-12

**Batch:** BOOTSTRAP · goal §6 **B4** — audit the inherited specs. R0 slice:
`portal/tests/transfer.spec.ts`, scenarios F1–F5 and F7.

**Result:** 5 KEEP · 1 STRENGTHENED · 0 DEMOTE (of 6 audited)

- Terminal: **40 → 40**. Ratchet unchanged, deliberately — see below.
- Audit record: **`docs/e2e-spec-audit.md`** (new). That file, not this one, is
  the durable per-spec verdict.

**In flight:** nothing.

### FINDING — the terminal count overstates what actually passes

The reconciler's default evidence mode is **static**: `PASS` means "a committed,
non-skipped test exists and a project config runs it", *not* "it passed". Its
own report header says so.

Running F1 to verify the strengthening below produced **three failures**, all
`TimeoutError` on `locator.click` / `locator.fill` at the Transfer link and the
recipient field. Pre-existing, not caused by the audit: iteration 3 verified the
same locator family failing at `transfer.spec.ts:687` under `--no-deps` with no
harness running, and the error *type* rules out the new assertion (an
`expect().toBe()` fails as an assertion error, never as a locator timeout).

So **R0's six terminal rows are static claims for tests that fail when run.**
Nobody should read `R0 6/83` as six working transfer scenarios.

**Do this before trusting any tier number:** run the portal suite with
`--reporter=json` and feed it to `pnpm e2e:coverage --results <file>`. That
converts static PASSes into run-verified ones and shows how much of the 40 is
real. I did not do it this iteration — it is a full portal suite run and a batch
of its own.

I did **not** lower the ratchet. Demoting on this evidence would be a scope
change (§12), and the honest reading is that the ledger is behaving exactly as
documented while the *mode* is too weak. Escalating rather than guessing.

### Audit verdicts — R0 / transfer

| # | Verdict | Why |
|---|---|---|
| F1 | **STRENGTHENED** | postcondition was text-only; chain `ownerOf` added |
| F2 | KEEP | `assertLacksRoles(owner, [ROLE_CAN_TRANSFER_ADMIN])` — rank 1, exactly the catalogue oracle |
| F3 | KEEP | text-only, but the catalogue's oracle *is* the copy — §4 rank 6 expressly permits it |
| F4 | KEEP | `assertRoleBitmap(owner, [])` + reason string |
| F5 | KEEP | `ownerOfName` chain read after the attempt |
| F7 | KEEP | `assertRoleBitmap` both parties, before and after — exemplary |

**F1's fault:** its final postcondition ran through `expectOwnerOnNamePages()`,
which asserted ownership purely as rendered text — verbatim §4's own example of
what does not count. `ownerOfName()` was already defined thirty lines above and
used by exactly one test. Fixed additively (rule 1: never weaken); the helper is
shared, so untagged transfer tests gained it too. **Unverified** — see above.

### Learned — do not re-derive

- **Grep-based auditing systematically under-reports chain assertions.** I
  nearly filed F2 as a finding because my pattern omitted `assertLacksRoles`.
  Chain reads here almost always hide behind domain-named helpers —
  `assertRoleBitmap`, `assertLacksRoles`, `ownerHasRole`,
  `readResolverAndSubregistry`, `driveTransactionsToSuccess`. Read the body; if
  you must grep, build the pattern from the file's imports.
- **A tag-shaped string in a comment is a latent false claim.** Iteration 1's
  untagging comment contained the literal `@scenario:GU4`, and my own file-level
  grep counted it as coverage. The reconciler did *not* — it only attributes
  tags within 6 lines after a `test(` declaration, and the comment sits before
  it — so no false claim ever reached the ledger. Defused anyway; it was one
  refactor from becoming real.
- `pnpm e2e:coverage --no-list` reports `Terminal 7/300`, not 40. That is the
  flag working: it skips the config query, so nothing is "run by" anything and
  everything reads as `excluded`. Do not mistake it for a regression.

### Parked

- `0x640294a2…` identity — owner **sugh01**, expires **2026-08-18** (iteration 2).
- Manager connect flow / `VITE_FF_USE_EOA` — owner **sugh01**, expires
  **2026-08-19** (iteration 4).
- **New:** whether to demote statically-passing rows whose tests fail when run —
  owner **sugh01**, expires **2026-08-19**. Needs the `--results` run first.

### Skipped-blocked

All manager-side scenarios (connect blocker, iteration 4). The portal transfer
UI flow now also looks broken — scope unknown beyond F1 and `:687`.

### Next

**B4 continued — the R2 block.** 26 of the ledger's 40 terminal rows are R2 and
rest on four portal files: `roles.spec.ts` (C1–C12, 10 tags), `subnames.spec.ts`
(D1–D6), `resolver.spec.ts` (E3, E6–E8, E10, E11), `records.spec.ts` (E1, E2,
E4, E5). That is the largest single block of unaudited inheritance and the
biggest lever on whether 40 is a real number.

Cheaper and higher-value first, if you only do one thing: the `--results` run
described above. It reprices the whole ledger in one pass.

---

## Iteration 5 — 2026-08-12

**Batch:** BOOTSTRAP · goal §6 **B0** (prove the environment) + **HW6**
(`fixtures/panoptes.ts`). **B0 complete.**

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Terminal: **39 → 40**. **HW 4 → 5.** Ratchet raised.
- Portal harness 10 tests, two consecutive green runs. Manager harness 4 passed
  / 1 skipped. Address gate green.

**In flight:** nothing.

### Why this batch, and a note on the anti-stall rule

Four iterations had run with terminal stuck at 39. §16.6 permits that during
bootstrap **but explicitly says `HW*` is what should move meanwhile** — and it
had not. That is the anti-stall rule biting for real, not a false alarm. This
batch was chosen to satisfy both: B0 needs a verified indexer, HW6 *is* that
verification made permanent, so the check cannot decay into a stale comment.

### B0 — PASSED

Every mapped key in `infra/panoptes/contracts.json` equals
`ensL1Contracts[sepolia]`: `ens_registry` (legacy), `base_registrar`,
`eth_registrar_controller`, `public_resolver`, `reverse_registrar`,
`name_wrapper`, `eth_registry` (V2), `migration_helper`,
`locked_migration_controller`, `unlocked_migration_controller` — 10/10. The
indexer is watching what the apps talk to. Now asserted by
`assertManifestMatchesConfig()`, run on every harness pass.

Unmapped manifest keys are each accounted for in a comment in `panoptes.ts`
rather than silently skipped (`root_registry` is not exposed by ensjs;
`registry_datastore` is vestigial; the `l2_*` are L2; `*_block` are block
numbers).

**Note when mapping:** the manifest's `ens_registry` is the **V1/legacy**
registry (ensjs `ensLegacyRegistry`); V2 is `eth_registry` (ensjs
`ensRegistry`). Mapping `ens_registry → ensRegistry` produces a false mismatch —
I hit it on the first pass.

### FINDING — Panoptes accepts broken queries and answers them plausibly

Three separate behaviours, all HTTP 200, all with no `errors` array. Measured
2026-08-12 against the running instance:

| Query | Response | Consequence |
|---|---|---|
| `{ thisFieldDoesNotExist { id } }` | `{"data":{"thisFieldDoesNotExist":null}}` | a typo, or a field Panoptes later renames, silently becomes "no data" |
| `events(bogusArg: 1, first: 1)` | 10+ rows | unknown argument dropped — **and it took `first` with it** |
| `events(first: 1, where: {blockNumber: 999999999})` | same row as unfiltered | a `where` clause it does not understand is ignored, so a filtered query returns the unfiltered set |
| `__schema { queryType { fields { … } } }` | `queryType: {name}` only, plus `mutationType`/`subscriptionType`/`types` unasked-for | it does not honour selection sets on `__schema`; it serves a canned payload |

This is the **INV4 confident-negative defect through a door that needs no
misconfiguration at all** — B0 can pass, the manifest can be perfect, and a
query with a drifted field name still returns a plausible empty. The goal's
field guide has "indexer success-with-zero-rows" as a *misconfiguration* trap;
this is the same outcome from ordinary schema drift.

Defences, both in `fixtures/panoptes.ts` and both asserted in the harness:

1. `query()` throws when any top-level field resolves to `null`. A valid list
   field returns `[]`, never `null`, so a null top-level field reliably means
   "this field does not exist".
2. `assertQueryFields(field, args)` introspects the real schema and throws on an
   unknown field or an unknown argument. Call it once per query shape before
   trusting a result — the server will never tell you.

**Consequence for INV4's 8 sites:** any of them written with a hand-guessed
field or filter name would silently pass. Use `assertQueryFields` first.

### Learned — do not re-derive

- **Panoptes GraphQL is at `:5655/graphql`.** `/`, `/health`, `/subgraph` all
  404. Iteration 4's handoff said :5655; the path is `/graphql`.
- Introspect via `__schema { types { name fields { … } } }` and find the root
  type by name. Asking for `queryType { fields }` returns no fields, per the
  table above.
- `helpers/indexer-sync.ts`'s internal `query` **swallows** transport and
  GraphQL errors and returns `null` — correct for polling, catastrophic for
  asserting. `fixtures/panoptes.ts` is the asserting counterpart; they are
  deliberately opposite and both are right for their job. Do not merge them.

### Parked

- `0x640294a2…` identity — owner **sugh01**, expires **2026-08-18** (iteration 2).
- Manager connect flow / `VITE_FF_USE_EOA` — owner **sugh01**, expires
  **2026-08-19** (iteration 4).

### Skipped-blocked

Every manager-side scenario, on the connect blocker. Unchanged.

### Next

**Bootstrap is done except B4.** B0 ✅, B1 ✅, B2 ✅, B3 ✅.

1. **B4 — audit the ~16 inherited specs** against §5. Do not count any of them
   as coverage until then; that is the explicit instruction in §1. Start with
   `projects/manager/playwright.config.ts`'s
   `testIgnore: /temporaryPremium|migration|notification/`, a live instance of
   trap #6 (config exclusion) and the source of the `A11` reconciler warning.
2. Then the first real scenario batch: **R0 portal-side** — `F` transfer (14
   rows) and `I` fuses (6). `G` (61) stays blocked on the V1 fixture.

Other harness rows still missing modules, each worth a batch when its tier needs
it: HW4 `time-presets`, HW7 `cross-app fixture`, HW8 `transaction-ids`, HW9
`fault-injection`, HW10 `premigration`.

Infra: Anvil ✅ :8545, manager ✅ :3000 (not e2e-connectable), portal ✅ :3001,
panoptes ✅ :5655/graphql, indexed head within 50k blocks of chain head.

---

## Iteration 4 — 2026-08-12

**Batch:** BOOTSTRAP · extend the harness gate to the manager project —
`specs/harness-manager.spec.ts`.

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Terminal: **39 → 39**. Ratchet unchanged. Invariant sites 0/32.
- 5 tests: **4 passed, 1 skipped**, two consecutive runs. Wired as a blocking
  dependency of `manager-e2e`.
- Portal harness re-verified green (7 passed). Address gate green.

**In flight:** nothing.

### FINDING — the `makeV1Name` blocker is now proven, precisely and citably

The rule-6 test fails exactly as predicted, and the diagnosis is no longer
inference:

- `makeV1Name` registers into `V1_BASE_REGISTRAR` = `0x64096092…`
  (`fixtures/makeV1Name.ts:61`).
- The migration code resolves `ensBaseRegistrarImplementation` through ensjs =
  `0x57f1887a…`, at **`apps/manager/src/features/migration/contracts/addresses.ts:14`**
  and **`packages/migration/src/service/preflightChecks.ts:13`**. Same story for
  `ensNameWrapper` at lines 18 and 17 of those files.
- Both registrars are deployed and live on the fork (asserted, so the diagnosis
  cannot silently rot).
- So registration succeeds and **the app cannot see any name this fixture
  makes**. Existing migration specs paper over it with a V1-subgraph route mock,
  which answers for a name the chain-reading half cannot find — that is why the
  suite above it stayed green for weeks.

Encoded as **`test.fail()`**, not skipped, so it *executes* every run:
- while the fixture is broken → the assertion fails → `test.fail()` passes;
- the moment someone rewires it → the assertion passes → Playwright reports
  "expected to fail but passed" → **red**, which is precisely when a human
  should look, because that is when the 61 `G*` rows unblock and the annotation
  must come off.

`makeV1Name`'s **rule 5 passes** — it genuinely registers into the registrar it
targets. The fault is only ever "wrong registrar", not "does nothing". Worth
knowing before anyone starts rewiring.

### BLOCKER — the whole `manager-e2e` project cannot run

`connectWithHeadlessWallet` (`helpers/manager-auth.ts:92`) waits 15s for a
Connect button the manager does not render under `VITE_FF_USE_EOA=false` in
`apps/manager/.env` — Para-embedded has no wagmi client for the headless
provider to attach to.

**Verified not caused by this batch**: `profile.spec.ts:113 "shows validation
errors for invalid records"` fails at the identical line under `--no-deps`, with
no harness project running. This blocks *every* manager-side rule-6 check and
every manager scenario, not just this file.

Not fixed here on purpose: flipping that flag restarts the owner's dev server
and changes which wallet path the app runs. That is their call, not a test-side
infra fix. Recorded as **blocked-env, owner sugh01, expires 2026-08-19**, and
the one affected test is `test.skip()`'d at its declaration with the reason at
the site.

### Learned — do not re-derive

- **`test.skip(true, …)` inside a test body does not work when the test uses a
  fixture.** Fixtures resolve *before* the body runs, so the in-body skip is
  reached only after the fixture has already thrown — the test fails instead of
  skipping. Use the static form `test.skip('title', fn)`, which takes no
  message, so the reason has to live in a comment.
- **`test.fail()` vs `test.skip()` mean different things and both are legitimate
  here.** `fail` keeps the test executing against a correct assertion whose
  current outcome is failure; `skip` is for blocked-env, and needs an owner and
  a date. Neither weakens an oracle — that distinction is what makes them
  allowed under §16.5.
- **The address gate caught one of my own violations this iteration**: a
  hardcoded zero-address literal in the new spec. Use viem's `zeroAddress`.
  Small, but it is the gate paying for itself two iterations after landing.
- V1 registration is a permanent fork write, so both `makeV1Name` tests are
  snapshot-wrapped — same reasoning as iteration 3's clock leak, since this file
  is also a project dependency.
- `ERC721.ownerOf` **reverts** on an unregistered token rather than returning
  zero. The helper catches it and returns `null`; a revert here is the answer,
  not an error.

### Parked

- `0x640294a2…` identity — owner **sugh01**, expires **2026-08-18** (iteration 2).
- Manager connect flow / `VITE_FF_USE_EOA` — owner **sugh01**, expires
  **2026-08-19** (this iteration).

Both need a human. Neither blocks portal-side work.

### Skipped-blocked

Every manager-side scenario, on the connect blocker above. R0's `F*` (transfer)
and `I*` (fuses) rows are portal-side and unaffected.

### Next

**B0 + B4, portal-side, then the first real batch.**

B2 is complete on both projects. Remaining bootstrap:

1. **B0** — Panoptes manifest vs `ensL1Contracts[sepolia]`. The API is on
   **:5655** (not 42069). This is the "success with zero rows" failure mode, and
   `INV4` has 8 sites waiting on it.
2. **B4** — audit the ~16 inherited specs against §5. Note
   `projects/manager/playwright.config.ts` carries
   `testIgnore: /temporaryPremium|migration|notification/`, which is a live
   instance of trap #6 (config exclusion) and explains the `A11` warning the
   reconciler still prints.

Then R0, portal-side only while the manager is blocked: **F** (transfer, 14
rows) and **I** (fuses, 6) are reachable; **G** (61) is not, on the fixture
above.

Infra: Anvil ✅ :8545, manager ✅ :3000 (serving, but not e2e-connectable),
portal ✅ :3001, panoptes-api ✅ :5655.

---

## Iteration 3 — 2026-08-12

**Batch:** BOOTSTRAP · goal §6 B2, second half — `specs/harness.spec.ts`.
**B2 is now complete.**

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Terminal: **39 → 39**. The suite carries no `@scenario:` tags — its subject is
  the fixtures, not the app. It moves the gate, not the ledger.
- Invariant sites: 0 checked. Ratchet: unchanged.
- **7 tests, two consecutive green runs** (12.0s, 12.0s), wired as a Playwright
  project dependency of `portal-e2e`, so red aborts the run.

**In flight:** nothing.

### What it covers

Each subject gets both halves — rule 5 (read the postcondition back
independently) and, where it applies, rule 6 (through the app's own read path).

| Subject | Rule 5 | Rule 6 |
|---|---|---|
| `makeName` | registered in the `.eth` registry, owned by the requested account, expiry in the future | the portal's `/$name` page renders it |
| `makeName` negative duration | the name really is expired at the current block | — |
| `makeSubname` | every level registered *in its stated parent registry*, owner matches, claimed subregistry actually attached, deepest owner holds a non-empty bitmap | — |
| `wallets` | three distinct, funded participants | the portal's header shows the injected account |
| `chain-snapshot` | `revert` actually undoes a registration | — |
| `time` | `increaseTime` moves `block.timestamp`, page clock follows, clock restored after | — |
| anvil | fork block > 1e6, `.eth` registry has bytecode at the address the apps' config names | — |

### Learned — do not re-derive

- **`ownerOf` needs `labelToCanonicalId(label)`, not `keccak256(label)`.** Note
  the registry ABI: `getStatus(uint256 anyId)` canonicalises internally,
  `ownerOf(uint256 id)` does not. Reading `ownerOf(keccak256(label))` returns
  **the zero address for a perfectly healthy name** — it looks exactly like "the
  fixture registered nothing". Idiom to copy: `transfer.spec.ts:65`.
- **`makeName`'s `owner` takes a portal *User* slot, not a `wallets`
  participant.** `wallets.ROLES` maps owner→user, manager→user2,
  stranger→user3; passing `'owner'` throws `User not found: owner`. Pair
  `makeName({owner:'user'})` with `wallets.account('owner')` — same account.
- **The portal header truncates to `0xf39…266`** — five leading characters, a
  U+2026 ellipsis, three trailing. A four-character prefix match finds nothing.
- **Three of my seven assertions were wrong on the first run**, and all three
  failed in ways that read as fixture or app faults rather than test faults.
  That is the argument for this suite existing, applied to itself: a harness
  gate written and never watched fail is worth nothing.

### The state leak this batch introduced, and closed

The first working version pushed the shared fork clock **+29 days per run**.
Because this project is a *dependency* of the whole portal suite, that is a
30-day jump before every run of everything.

Two separate causes, and the obvious one was not the culprit:

1. `time`'s explicit `increaseTime` — snapshotted and reverted. Suspected first.
2. **`makeName({duration: -1 day})` — the actual source.** The fixture
   implements "expired name" as *register for the 28-day minimum, then advance
   the clock past expiry*, so asking for an expired name costs ~29 days of fork
   clock, permanently. Harmless in a leaf spec; not harmless in a dependency.

Measured before/after each fix: **+29 days → +158 seconds** (block mining
only). Both are now snapshot-wrapped, and the `time` test *asserts* the restore
rather than assuming it.

**Generalisation worth carrying:** anything that runs as a project dependency
must be clock-neutral. The fork is at **2027-06-02** against a wall clock of
2026-08-11 — ~295 days ahead, accumulated by prior runs. Most of that predates
this batch; 90 days of it was mine before the fix.

### Not caused by this batch

`transfer.spec.ts:687 "rejects the zero address as a recipient"` fails —
`getByPlaceholder('ENS name or address')` times out on
`/$name/ownership/transfer`. **Verified pre-existing**: it fails identically
under `--no-deps`, with the harness project not running at all. Not triaged
further; it belongs to whoever takes the F-area batch. It is the only portal
test this iteration executed, so no claim is made about the other 57.

### Parked

`0x640294a2…` identity — owner **sugh01**, expires **2026-08-18**. Unchanged
from iteration 2, and still blocking any trustworthy `GR*` result.

### Skipped-blocked

Nothing.

### Next

Two candidates; take the first.

1. **Extend the harness gate to the manager project.** `makeV1Name` and
   `makeV2Name` have no self-test, and `makeV1Name` is the fixture whose known
   fault (registering into a deployment the migration UI never reads) is the
   documented blocker on all 61 `G*` rows. A self-test there turns an
   undocumented weeks-long silent failure into an immediate red. Expect it to
   fail on the rule-6 half — that is the point, and the failure should be filed,
   not weakened. **Do not wire it as a blocking dependency while it is red**;
   put it in its own non-blocking project first, or the manager suite cannot
   run at all.
2. **B0 / B4** — Panoptes manifest vs `ensL1Contracts[sepolia]` (the API is on
   **:5655**, not 42069), then audit the ~16 inherited specs.

Then R0: **83 rows, 77 not-started**.

Infra this iteration: Anvil ✅ :8545, manager ✅ :3000, portal ✅ :3001,
panoptes-api ✅ :5655, mockestrator :3007, alto :4337.

---

## Iteration 2 — 2026-08-11

**Batch:** BOOTSTRAP · goal §6 B2, first half — the rule-7 address-literal gate.

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Terminal: **39 → 39**. Ledger untouched.
- Invariant sites: 0 checked.
- Ratchet: unchanged.
- New gate: `pnpm e2e:check:addresses`, wired into `.github/workflows/e2e.yml`
  ahead of the reconciler. **Green.**

**In flight:** nothing.

### FINDING — one address, two contradictory identities

`0x640294a2b2d87e7f522db3e3e3e876764bce170d` is declared as
**`V1_PUBLIC_RESOLVER`** in `fixtures/makeV1Name.ts:65` and as
**`DEDICATED_RESOLVER`** — a V2 resolver — in `fixtures/makeName.ts:57`. It
cannot be both.

Measured on the fork at block 11467283, 2026-08-11:

| | address | size | codehash |
|---|---|---|---|
| the disputed address | `0x640294a2…` | 15115 B | `0xd1d78319` |
| ensjs `ensPublicResolver` | `0x5239A812…` | 14001 B | `0x6cce3025` |
| ensjs `ensPermissionedResolverImpl` | `0x9EAe5C27…` | 17597 B | `0x7a5bbb7f` |
| V1 registry's resolver for `eth` | `0x18CB116a…` | 10700 B | `0x090b6561` |

It answers ERC165 / `addr` / multicoin `addr` / `text` / `contenthash` but not
`IExtendedResolver`, and **it does not appear anywhere in
`ensL1Contracts[sepolia]`**. So it is a third contract carrying two names, and
at least one of those names is wrong.

Not filed in `e2e-defects.md`: the reconciler requires a defect row to name a
scenario *and* have a failing test proving it, and this is a harness fault with
neither — filing it would trip the `defect-unproven` CI failure. It lives here,
in a comment at `makeName.ts:57`, and in the gate's allowlist with
`conflictAcceptedUntil: 2026-08-18`, owner **sugh01**. The gate goes red on that
date. Per §10 the ruling defaults to EXEMPT after 5 working days — but note that
an EXEMPT here would mean *accepting an unidentified resolver*, which is not a
real option; someone has to say which name is correct.

**Consequence: no `GR*` record-replay result can be trusted until this is
settled.** GR1/GR3/GR12 all turn on which resolver a V1 name is reported to
have. Do not spend an iteration on the GR batch before resolving it.

### What changed

- **`scripts/check-address-literals.ts`** — new. Two checks:
  1. *unaccounted literal* — a 20-byte hex literal with no allowlist entry;
  2. *conflicting binding* — one address bound to two identifier names, which is
     the drift incident itself. Waivable only with an owner and a date.
- **`helpers/mock-v1-subgraph.ts`** — was re-declaring `V1_PUBLIC_RESOLVER` and
  the NameWrapper address as its own literals. Now imports both from
  `makeV1Name.ts`, which is the single place the V1 deployment is pinned. This
  was the "same registry, three different addresses, three files" pattern in
  progress.
- **`.github/workflows/e2e.yml`** — the gate runs in the `coverage` job, before
  the reconciler.

### Learned — do not re-derive

- **Anchor the regex on both sides: `\b0x[0-9a-fA-F]{40}\b`.** Without the
  trailing `\b` it matches the first 40 characters of every 32-byte Anvil
  private key in the tree. That is the difference between 35 hits and 12, and
  it is why the "35 literals" number in iteration 1's handoff overstated the
  problem — the real count is 14 occurrences of 12 distinct addresses.
- **Detect the binding by looking back two lines, not one.** The formatter wraps
  `export const V1_PUBLIC_RESOLVER =` onto its own line. A line-local match
  found zero bindings in `makeV1Name.ts` and reported the tree clean — it missed
  the one conflict the gate exists to catch. First version of this gate was
  green and useless; a passing gate is worth nothing until you have watched it
  fail.
- **The gate must skip itself.** The allowlist necessarily contains every
  address it governs, so scanning it makes every entry conflict with its own
  subject (7 false conflicts).
- **`pnpm --filter @ens-apps/e2e lint` (`biome check`) already fails** on
  pre-existing issues across ~12 files. The gate is deliberately *not* chained
  behind it with `&&` — it would never run. It is its own script and its own CI
  step.
- **Gate self-test, actually run:** planted an unaccounted literal → exit 1;
  planted a second name for `V1_ENS_REGISTRY` → exit 1 naming both sites; clean
  tree → exit 0. Both violation classes reproduce.
- The 12 accounted-for addresses split into: 2 Anvil dev EOAs, 2 placeholder
  sentinels, 1 canonical cross-chain deployment (Multicall3), 4 pinned-V1-
  deployment contracts, 1 HCA account derived outside the e2e dependency graph,
  1 ENSIP-25 identifier, and the disputed resolver above. 13 occurrences across
  8 files.
- **Known limit of this gate.** It enforces *every literal is accounted for* and
  *no address wears two names*. It does **not** catch a file re-declaring an
  address another file already exports, when both use the same name — that is
  legal under both checks. Biome's unused-import warning is what caught exactly
  that here: the first version of the `mock-v1-subgraph.ts` deduplication
  imported `V1_NAME_WRAPPER` but left the literal in place, so only the resolver
  half landed. If a third check is ever wanted, it is "an allowlisted address
  appears in a file that is not its declaring module".

### Parked

`0x640294a2…` identity — owner **sugh01**, expires **2026-08-18**. See above.

### Skipped-blocked

Nothing.

### Next

**B2, second half — `e2e/specs/harness.spec.ts`.** Not started; nothing is
half-applied. It is the higher-value half (it defends the fixture-invisible-to-
the-app class that cost weeks of confidently wrong results) and it is a batch on
its own because it needs live infra and browsers, where the address gate needed
neither.

Each fixture asserts (a) its own postcondition by read-back and (b) that the app
can see the state through the app's own read path — rules 5 and 6. Subjects, in
dependency order: `makeV2Name`, `makeSubname`, `makeName`, `wallets`,
`chain-snapshot`, `time`, `makeV1Name` (expected red — see its header comment;
it registers into a registrar the migration UI never reads, which is the known
blocker on all 61 `G*` rows). This suite must run first and red must abort the
run.

Infra was up and healthy this iteration: Anvil at block **11467283**, manager
and portal both 200. `pnpm e2e:infra:up` did not need re-running.

After that: B0 (fork block + Panoptes manifest vs `ensL1Contracts[sepolia]`) and
B4 (audit the ~16 inherited specs). Then R0 — **83 rows, 77 not-started**, with
the `G*` matrix at zero and blocked on the V1 fixture, so per §16.3 the unblock
outranks any batch inside the tier.

---

## Iteration 1 — 2026-08-11

**Batch:** BOOTSTRAP · goal §6 B1 + B3 — rebuild the ledger against
`e2e-test-catalogue.md` and stand up Track B.

Not a scenario batch. The bootstrap gate in the skill's Step 1 was open: the
ledger held 179 rows on the superseded P0–P6 phase model, the catalogue defines
~295 on the R0–R4 risk-tier model, and `invariants.ts` did not exist. Per goal
§16.6 this is expected — the terminal count does not move during bootstrap, and
that is not stalling.

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Registry: **179 → 300 rows** (290 scenarios + 10 `HW*` harness).
- Terminal: **39 → 39**. Deliberately unchanged — every re-bucketed row kept
  exactly the evidence it already had. Verify with
  `pnpm e2e:coverage`: `Terminal overall: 39/300`.
- Invariant sites: **0 → 32 registered**, 0 checked.
- Ratchet: rekeyed from phases to tiers, seeded from the observed run
  (`HW 4 · R0 6 · R1 2 · R2 26 · R3 1 · R4 0`). The old P0–P6 numbers are frozen
  in `baseline.json:phasesLegacy` as an audit trail.

**In flight:** nothing.

### What changed

`e2e/coverage/scenarios.ts`
- Added `Tier` (`HW · R0 · R1 · R2 · R3 · R4`) derived from the id prefix via
  `AREA_TIER`, overridable per row. `phase` is retained for traceability to the
  superseded master plan but is **no longer the ratchet key**.
- Rebuilt area **G** from flat `G1–G27`/`GB1–GB8` (35) into the catalogue's
  `GW · GS · GR · GM · GA · GU` (61). The old numbering conflated wrap level with
  fuse burn and had no slot for the record-kind matrix (`GR4–GR7`) where the
  INV2 conservation findings live. Old ids are carried in `planId`.
- Added the catalogue's missing rows: A22–A25, B15–B18, C15–C17, D15–D18,
  E16–E21, F9–F14, I6, J8–J9, K11–K12, L5–L6, X11–X16.
- Added the seven new suites: **N** notifications (12), **Y** payments (7),
  **R** resolution (10), **S** search (7), **T** token (6), **U** shell (9),
  **Z** DNS/TLD (5).

`e2e/coverage/invariants.ts` — new. INV1–INV5 with 32 sites. A site is claimed
by `@inv:INV1-transfer-plan`, and the reconciler derives its status from exactly
the evidence it derives a scenario's PASS from.

`e2e/coverage/reconcile.ts` — rolls up by tier, sweeps invariant sites, ratchets
on both, fails on an unknown `@inv:` tag as it already did on an unknown
`@scenario:` tag.

### Learned — do not re-derive

- **Terminal count is 39 and the arithmetic checks out.** HW 4 + R0 6 + R1 2 +
  R2 26 + R3 1 = 39, matching the pre-rebuild P0 4 + P1 26 + P2 2 + P5 7. If a
  future run reports fewer, something was lost, not re-bucketed.
- **Ids that meant different things in the two documents.** The catalogue won
  every time; the displaced row moved to its new suite. **None of them were
  tagged**, so no coverage moved with them:

  | Superseded plan | Now | Catalogue's meaning for that id |
  |---|---|---|
  | B10 auto-renewal toggles | **Y6** | B10 = bulk renew pricing |
  | B14 four branches *+ syncWrapper* | B14 / **B15** | split; B15 = syncWrapper |
  | B15 continuity bonus | **B16** | B16 = bonus at day 61 and 63 |
  | H4 search | **S1** | H4 = dashboard role-derived columns |
  | H8 primary name | **R1** | H8 = recent-activity feed |
  | H9 fwd/rev mismatch | **R5** | H9 = empty states |
  | H10 token page | **T1** | H10 = expiry rendering per locale |
  | H11 TLD page | **Z1** | H11 = profile owned by a contract/HCA |
  | J7 notifications | **N1–N12** | J7 = HCA deployment on first use |
  | K3–K7 | K4–K8 | K3 is new: indexer up-but-stale, zero rows |
  | K8 back/forward | **U7** | K8 = two tabs, conflicting writes |
  | K9 deep link disconnected | **U6** | K9 = double-click, one transaction |
  | L2 axe *+ keyboard* | L2 / **L3** | split; L3 = keyboard-only |
  | L3 mobile → L4, L4 perf → L5 | | L6 is new: locale number/date formatting |

- **`GA11` and `GA12` are not in the catalogue.** They carry the superseded
  plan's G14 (`NameDataMismatch`) and G15 (`notReserved`) forward, because
  deleting a scenario is a scope change (§12) and neither was ruled on. The
  catalogue's totals table was corrected to 61 for G / 290 overall to match.
- **Two migration tests were untagged, not retagged.** `migration-premium.spec`
  "migrate active name" (was `@scenario:G16`) and `migration.spec` "can edit
  profile after migration" (was `@scenario:G24`). Both were already `excluded`
  — no config runs them — so no terminal state was lost. Neither meets its
  candidate row's oracle: the first asserts only `assertV2Registered` where GW3
  also requires "not unwrapped" + WrapperRegistry-as-subregistry; the second
  asserts a "Profile updated" toast where GU4 requires reading the records back
  off the new resolver. A comment in each names the row and what is missing.
  Tagging either as-is would have been a partial tag (§16.5).
- **B2's backlog is measured: 35 hex address literals across 17 files** under
  `e2e/{fixtures,helpers,projects,specs,scripts}`. That is what the rule-7 grep
  gate has to clear before it can be turned on red.

### Parked

Nothing. No ruling was needed this iteration.

### Skipped-blocked

Nothing. No batch was skipped.

### Next

**Bootstrap B2 — harness integrity gates.** It is the last open bootstrap item
and the skill's Step 1 keeps the gate closed until it lands:

1. `e2e/specs/harness.spec.ts` whose *subject is the fixtures* — each fixture
   asserts its own postcondition by read-back **and** that the app can see the
   state through its own read path (rules 5–6). This suite runs first and red
   aborts the run. It is what makes `HW1`–`HW10` terminal, so it moves the
   ledger as well as the gate.
2. The rule-7 address-literal grep as a CI check, over the 35 literals above.
   Derive from `ensL1Contracts[sepolia]` through one generated file.

Then B0 (prove the environment: fork block, Panoptes manifest vs
`ensL1Contracts[sepolia]`, both apps load) and B4 (audit the ~16 inherited
specs) before any scenario batch. After that, R0 selection is unambiguous:
**83 rows, 77 not-started**, and the migration matrix inside it is at zero and
blocked on the V1 fixture — so per §16.3 the unblock outranks a batch inside the
tier.
