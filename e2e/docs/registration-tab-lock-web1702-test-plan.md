# WEB-1702: Registration wallet lock across tabs, QA test plan and report

PR: [#1314 fix(manager): keep the registration lock when a tab is duplicated](https://github.com/ensdomains/apps-monorepo/pull/1314) (follow-up to #1254)
App: **manager** (`apps/manager`, `:3000`)
Spec: `e2e/projects/manager/tests/registration-rhinestone.spec.ts` (`one registration per wallet across tabs (WEB-1702)`)
Unit: `apps/manager/src/features/register-v2/state/useRegistrationLockSweep.test.ts`

---

## 1. Change surface

#1254 lets a wallet run one registration at a time. A tab registering holds a
claim in localStorage (`ens-registration-locks-v1`), keyed by the wallet and
stamped with the tab's holder id from sessionStorage
(`ens-registration-holder`). The registering screen refreshes it every 15s and
it goes stale after 60s. The registration flow sweeps "this tab's" claims when
it mounts and unmounts, so a reload frees the wallet. QA found two problems.

**Bug 1, the lock wiped by a duplicated tab.** Chrome's "Duplicate tab" clones
sessionStorage, holder id included. The clone's mount sweep removed the
original's live claim. A tab duplicated mid-registration opens on the same
`/register/<name>` URL and finds the resume record. Once connected, it resumed
the same registration as its own attempt (same holder id and name, so the lock
treats it as re-entrant). Two tabs then drive one registration on one permit
nonce, which is the race #1254 exists to stop.

**How a user reaches it:** start a registration, then right-click the tab and
choose Duplicate.

**Bug 2, the refusal shown as a failure.** A tab the lock refused showed
"Registration Failed", "Cannot register: … Finish or cancel it first", and
"Retrying will attempt the registration again from where it left off", with
Try Again as the primary button. Nothing had started, and the fix is in the
other tab.

| File | Role | Change |
|---|---|---|
| `service/registrationLock.ts` | Writer / reader | `claimTabHolderId` broadcasts the tab's id on `ens-registration-holder-claim`. A live tab answering to that id replies `taken` and the clone takes a fresh id. Simultaneous claims are ranked. `releaseHolderLocksWhenSettled` waits on that before sweeping. `releaseHolderLocks(since)` keeps claims made or refreshed while the sweep waited |
| `state/useRegistrationLockSweep.ts` (new) | Hook | Mount and unmount sweeps, both through `releaseHolderLocksWhenSettled` |
| `state/registrationUi.context.tsx` | Provider | Uses the hook in place of the synchronous `releaseHolderLocks()` effect |
| `state/registrationUi.machine.ts` | UI machine | The refusal raises `$walletBusy`, not `$error`. `isWalletBusy` in context is cleared on cancel, retry and any real error. New message copy |
| `workflow/result/FailureStep.tsx`, `messages.po` | UI | "Another Registration Is Running", clock icon, "Finish or cancel the other registration in its tab, then Try Again once this wallet is free.", Back to Quote primary |

---

## 2. Automated coverage

The PR's unit tests cover `claimTabHolderId` against a stub channel, the
machine's busy flag, and the screen render. These tests add two real tabs in
one browser context: shared localStorage, a real `BroadcastChannel`, the real
provider mount sweep, a real registration's heartbeat, and the resume path a
duplicated tab really takes. Playwright can't press "Duplicate tab", so the
second page gets the first page's sessionStorage copied in before the app
loads, which is what the browser does. The oracle for "the wallet is still
held" is the stored claim itself: same name, original's holder id.

Tests 2–4 seed the original's claim instead of registering. `holdClaim`
refreshes it the way the heartbeat does, only while it is still that tab's, so
a claim the clone sweeps away stays gone. Test 1 is the same scenario with a
real registration.

| # | Test | What it proves | Pre-fix | PR |
|---|---|---|---|---|
| 1 | A tab duplicated mid-registration leaves the original's claim in place and does not resume it alongside | Real HCA registration to commit confirmed in tab A, then a clone on the same URL. Disconnected, the clone shows "Unfinished registration" and **A's claim survives**, with the clone on a new id. Connected, the clone is refused with "Another Registration Is Running" naming A's name, and the claim is still A's. A finishes and the registry shows the wallet as owner, with the claim released. The clone's Try Again afterwards submits **no permit, commit or reveal**, and the owner is unchanged | FAIL: claim is `null` right after the clone mounts | pass, 1.5m |
| 2 | A duplicated tab does not free the original's claim, and is told to wait for it `@smoke` | Seeded live claim in A. A clone on another name keeps A's claim and takes a new id. Register shows the busy screen (title, exact message, next step, Try Again and Back to Quote, **no** "Registration Failed", **no** retry copy). Positive control: when A lets go, Try Again starts the clone's registration, and the claim becomes the clone's name under the clone's new id | FAIL: claim is `null` | pass, 13.8s |
| 3 | A second tab refused by the lock says another registration is running, not that this one failed | Ordinary second tab (own id, not cloned). Busy screen as above. Back to Quote returns to the quote, clears the notice, and leaves A's claim alone | FAIL: "Another Registration Is Running" not found; the page shows "Registration Failed" + "Cannot register: …" + retry copy + Try Again primary | pass, 14.1s |
| 4 | Reloading the original with its clone open still frees the original's leftover claim | Guard. A's leftover claim (heartbeat gone with the reload) is swept on reload, and A keeps its id, because the clone no longer answers to it | pass (guard) | pass, 13.7s |

Unit, `useRegistrationLockSweep.test.ts`. These drive the new hook against the
real lock module with a stub channel playing the other tab:

| # | Test | Pre-fix* | PR |
|---|---|---|---|
| U1 | Leaves the original tab's live claim alone when a duplicated tab mounts | FAIL (claim `undefined`) | pass |
| U2 | Leaves it alone when the duplicated tab unmounts inside the claim window | FAIL (claim `undefined`) | pass |
| U3 | Still frees this tab's own leftover claim when no other tab holds its id | pass (guard) | pass |
| U4 | Frees a claim this tab made once the flow unmounts | pass (guard) | pass |

\* The hook is new, so "pre-fix" means the hook file holding the provider's old
effect body (`releaseHolderLocks()` on mount and unmount) against the base
`registrationLock.ts`.

Tests 1–3 and U1–U2 fail on the assertion that encodes the bug, not on a
timeout or setup step. Test 4 and U3–U4 are guards: the sweep still frees a
tab's own claim, and the PR must not break that.

---

## 3. Results (PR merged onto `e2e-tests-coverage`)

- New e2e tests: 4/4 pass on the PR build. Pre-fix: 1–3 fail as above, 4 passes (guard).
- `registration-rhinestone.spec.ts` in full: 11/12 on the first run. The WEB-1148 lost-race test timed out in the search dropdown, before the registration flow (`getByText('<label>.eth').click()`), and passed on re-run (1.2m). The other 11 passed, including the four above.
- `pnpm test:manager-smoke`: 6/7 in 189s, with the new smoke test passing in 15.5s. The one failure is the WEB-424 grace test: it expects `/migration`, but #1307 renamed that route to `/upgrade` on `e2e-tests-coverage`. It predates this PR, which touches no migration files (F4). Needs `MAILINATOR_API_KEY` in the environment.
- Unit tests: `apps/manager` register-v2 258/258 (the PR's 254 plus the 4 hook tests).
- Typecheck is clean in `apps/manager` and `e2e`. `biome check` shows no warnings on the PR's files or the new tests.

**Stack note.** The shared anvil's clock was about 129 days ahead of wall
time, which breaks every HCA registration. A restart of anvil plus a Panoptes
reset fixed it before any of these runs.

---

## 4. Manual test plan

### Setup

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cp apps/manager/.env.ci apps/manager/.env      # VITE_FF_USE_EOA=false (HCA path)
pnpm --filter manager dev -- --port 3000
```

- **Browser.** Chrome or Edge, since "Duplicate tab" is the point. Use a
  browser wallet with Anvil account 0 (`0xf39F…2266`) on the local fork
  (chain id 11155111, RPC `http://127.0.0.1:8545`).
- **DevTools.** Application → Local Storage → `ens-registration-locks-v1`, and
  Session Storage → `ens-registration-holder`, in each tab.
- **A name registered by someone else** (for M7 only):

  ```sh
  OWNER=user2 STATE=active pnpm --filter @ens-apps/e2e seed:name
  ```

### Steps

| # | Step | Pass |
|---|---|---|
| M1 | Tab A: search a fresh label, open it, Pay with stablecoins → USDC → Register name → Set up later. Wait for the countdown to start | `ens-registration-locks-v1` holds `{ name: <label>.eth, holderId: <A's id> }` |
| M2 | Right-click tab A → **Duplicate**. In tab B, look at storage after a second | The lock is unchanged (still A's id). B's `ens-registration-holder` is a **different** id from A's |
| M3 | Tab B shows the quote with "Unfinished registration". If B isn't connected, connect | B shows **Another Registration Is Running**, "<label>.eth is already being registered with this wallet, possibly in another tab. One registration runs at a time, so this one has not started.", a clock icon, and the next step "Finish or cancel the other registration in its tab…". **Back to Quote** is blue (primary) and Try Again is light. No wallet prompt appears in B |
| M4 | Back in A, let the registration finish | "Registration Complete". The lock entry is gone |
| M5 | In B, press Try Again | No wallet prompt, and nothing is charged (check the USDC balance). Note what the screen shows (see F1) |
| M6 | Two separate tabs: open tab C as a new tab (not a duplicate) on another fresh label, connected, while A is registering (repeat M1 for A). Press Register in C | Same busy screen as M3, naming A's name. Back to Quote returns to the quote with no notice, and A's lock is untouched |
| M7 | In C, on the busy screen, wait for A to finish, then press Try Again | C's registration starts (wallet asks for the permit). The lock is now C's name under C's id |
| M8 | Reload: start a registration in A, then reload A during the countdown | The resumed registration carries on in A. No busy screen in A |
| M9 | Reload with a clone open: duplicate A (M2), then reload **A** | A resumes normally and is not refused. B keeps its own id |
| M10 | Firefox (Duplicate Tab also clones sessionStorage there): repeat M1–M3 | As in Chrome |

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | Low | **A clone's Try Again after the original finished ends on a misleading failure.** The clone of a tab mid-registration queues the *resume* of that same name as `pendingStart`. Once the original completes, the busy screen's Try Again re-raises that resume for a name that is now registered. The clone shows "Registering name", then "Registration Failed: Commitment timestamp not recorded after multiple attempts…" with the "Retrying will attempt…" copy, and it takes the wallet lock while doing so (the lock goes stale 60s after the heartbeat stops). Nothing is signed or submitted (no permit, commit or reveal, checked in test 1), so no money is at risk. But the busy screen itself tells the user to press Try Again, and that leads here. A resume refused by the lock could re-check the name or the stored record before retrying, or land on the name's page. |
| F2 | Info | The fix depends on `BroadcastChannel`. Without it the id stays as it was (today's behaviour, by design). Every current evergreen browser has it. |
| F4 | Test infra, pre-existing | The manager smoke test `a grace-period name is offered for renewal from the dashboard and listed on /migration` (WEB-424) fails on `e2e-tests-coverage`: the app now routes to `/upgrade` (#1307, `5e6b71698`). Not from this PR |
| F3 | Info, test infra | The e2e can't press "Duplicate tab". It copies sessionStorage into a second page before load, which is what the browser does. M2–M3 and M10 cover the real gesture by hand. |
