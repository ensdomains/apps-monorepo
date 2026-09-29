# WEB-1490: Registration success banner, QA test plan and report

PR: [#1247 Stop the name page trusting a registration claim from the URL](https://github.com/ensdomains/apps-monorepo/pull/1247)
Report: Immunefi #92544 (Low)
App: **portal** (`apps/portal`, `:3001`)
Spec: `e2e/projects/portal/tests/registration.spec.ts` (`Portal registration success banner — not forgeable from a link (WEB-1490)`)

---

## 1. What changed

`/$name` used to read `?registered=true&duration=…&paid=…` and render
**"Congratulations! You are the owner of {name}"** along with the `paid`
string exactly as the URL gave it. Nothing checked that a registration had
happened or that the visitor owned the name. So a link on the real portal
origin could tell any visitor they owned someone else's name, at any price,
and the page's only call to action was **Extend**, which renews the
attacker's name from the visitor's wallet.

| File | Change |
|---|---|
| `routes/$name/index.tsx` | `validateSearch` and the search-param type are removed. The banner reads `location.state` through `useRouterState` |
| `register/types/registrationSuccessState.ts` | New. `readRegistrationSuccessState` parses history state (`durationSeconds` must be a finite number, `paid` must be a string) and returns `null` for anything else |
| `register/hooks/useRegistrationSuccessRedirect.ts` | The post-registration `navigate` writes `state.registrationSuccess` in place of `search`. The banner is skipped when `paid` is undefined, as before |

**Out of scope, by design:** Extend is still offered on names you don't own.
Renewing another party's name is permitted, and the PR leaves a confirmation
step to product.

---

## 2. Automated coverage (e2e, real browser, real chain)

The PR's own unit tests run the route with a stubbed router. These tests use
the real router, real URL parsing and real `window.history`, against names
that exist on the Anvil fork.

| # | Test | What it proves | Pre-fix code | PR code |
|---|---|---|---|---|
| 1 | the reported crafted link does not tell a visitor they own someone else's name (`@smoke`) | The report's exact URL, on a name owned by another account, with the visitor connected. The real owner is shown, and there is no banner, no "$0.00 (free)" and no "10 years" | ❌ banner shown | ✅ |
| 2 | the crafted link is ignored for a disconnected visitor too | Same, without a wallet | ❌ | ✅ |
| 3 | the crafted link is ignored even on a name the visitor really owns | The banner is a receipt for a registration made in this session, not an ownership badge | ❌ | ✅ |
| 4 | no variant of the old query parameters brings the banner back | 7 variants: the pre-fix app's own redirect URL, JSON-encoded values, `registered=1`, `registered=TRUE`, the flag alone, markup in `paid`, and the new state key smuggled in as a search param. No banner, no injected `<img>`, no native dialog | ❌ | ✅ |
| 5 | a crafted link on an unregistered name shows it as available, not as yours | Guard only. The old banner never rendered on the available page, so this passes on both builds | ✅ | ✅ |
| 6 | history state is parsed on read: a well-formed entry renders, malformed ones are ignored | Positive control: the state the app writes renders the banner, which proves tests 1–4 aren't passing on a page that simply lost it. Six malformed shapes neither render nor crash | ❌ positive control fails (pre-fix ignores state) | ✅ |
| 7 | a real registration still shows the banner, and the URL it lands on cannot reproduce it | Full UI registration (1y, USDC). The banner's **Paid** equals the USDC that actually left the wallet (chain oracle), and the period reads "1 year". The landing URL has no `registered`/`duration`/`paid`. Reloading the same tab keeps the banner. The same URL in a **new tab** has no banner. A later visit has no banner | ❌ URL carries `registered` | ✅ |

**Results on the PR build (merged onto `e2e-tests-coverage`):** 7/7 pass; the
whole `registration.spec.ts` passes 9/9, and the portal smoke gate
(`pnpm test:portal-smoke`) passes 10/10. With the PR's two app files reverted,
6/7 fail, each on the assertion that encodes the bug.

Typecheck is clean. `biome check` reports two complexity warnings in this
file, and both already exist on the base branch.

**Note on scope:** banner assertions are scoped to `<main>`. In dev builds the
TanStack Router devtools panel echoes the raw search params, so
`$0.00 (free)` *is* in the DOM there, in a panel no production visitor sees.
This is not a finding, but a manual tester on `pnpm dev` will see it, so
don't count it as a failure.

---

## 3. Manual test plan

### Setup

```sh
pnpm --filter @ens-apps/e2e infra:up          # or, as CI does:
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
cp apps/portal/.env.ci apps/portal/.env
pnpm --filter portal dev -- --port 3001
```

- **Wallet.** Either connect a browser wallet on Anvil account 0
  (`0xf39F…2266`), or set `VITE_USE_MOCK_WALLET=true` in `apps/portal/.env`
  and restart. Mock mode auto-connects account 0. Turn it back off before
  running Playwright.
- **Seed an "attacker" name** owned by account 1 (`0x7099…79C8`):
  `OWNER=user2 STATE=active pnpm --filter @ens-apps/e2e seed:name`.
  Note the printed name; the steps below call it `ATTACKER`.
- **Seed a name you own:** `OWNER=user STATE=active pnpm --filter @ens-apps/e2e seed:name`.
  The steps below call it `MINE`.
- If owner rows are empty after an Anvil restart, reset Panoptes (wipe
  `ens_v2.db*` in the `infra_panoptes-data` volume and restart the indexer).

### Crafted links: none of them may show the banner

For each row, open the URL. **Pass:** the page shows the name, the **Owner**
row shows the real owner, and there is **no** green "Congratulations!" banner,
no "You are the owner of…", and no "Paid" figure. Ignore the devtools panel
at the bottom of the page.

| # | URL | Also check |
|---|---|---|
| M1 | `/ATTACKER/?registered=true&duration=315360000&paid=$0.00%20(free)` (the report's URL), connected | Owner is `0x7099…79C8`, not you |
| M2 | Same URL, **disconnected** | |
| M3 | Same URL on `MINE` | No banner, even though you own it |
| M4 | `/ATTACKER/?registered=true&duration=31536000&paid=%245.00` | This is the URL the **old** build produced after a real registration, so it's what an old bookmark looks like |
| M5 | `/ATTACKER/?registered=true&duration=31536000&paid=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E` | No alert, no broken image |
| M6 | `/ATTACKER/?registrationSuccess=%7B%22durationSeconds%22%3A1%2C%22paid%22%3A%22%240%22%7D` | The new state key doesn't work as a search param |
| M7 | `/some-unregistered-name-xyz.eth/?registered=true&duration=315360000&paid=$0.00%20(free)` | Shows "… is available!" with Register. No banner |

### Real registration: the banner must still work

| # | Step | Pass |
|---|---|---|
| M8 | Note your USDC balance. Register a fresh name at `/register?name=<new>.eth`, 1 year, USDC | After the dialog completes you land on `/<new>.eth` with the green banner: "You are the owner of `<new>.eth`", Registration "1 year", and **Paid** equal to the USDC that left your wallet |
| M9 | Look at the address bar | The URL is just `/<new>.eth`, with no `registered`, `duration` or `paid` |
| M10 | Reload (⌘R) | The banner is still there. It belongs to this tab's history entry, which is expected |
| M11 | Copy the URL and open it in a **new tab** (or send it to another browser) | **No banner.** This is the fix: sharing the URL doesn't share the claim |
| M12 | Go to the home page, then search for and open `<new>.eth` again | No banner |
| M13 | Back button from M12 until you return to the post-registration entry | The banner may reappear on that exact entry. That's acceptable (the app wrote the state, and it's your own tab) |

### Regression checks around the change

| # | Step | Pass |
|---|---|---|
| M14 | Open any name page with unrelated params, e.g. `/ATTACKER/?foo=bar` | The page renders normally, with no error boundary |
| M15 | On a name page, run in the console: `history.replaceState({...history.state, registrationSuccess: {durationSeconds: 'x', paid: 5}}, ''); location.reload()` | Normal page, no banner, no crash. (Writing a well-formed entry the same way *does* show the banner. That's same-origin script, not an attack path) |
| M16 | Extend on `ATTACKER` (not your name) | Still offered, by design. Confirm the page does **not** claim you own it |

---

## 4. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | Nit | `useRegistrationSuccessRedirect.ts` docstring still says it "redirects to `/$name` with the duration + paid amount as **search params**". Now it's history state |
| F2 | Info | In dev builds the TanStack Router devtools panel shows the crafted `paid` text (see §2). Dev-only, so not user-facing |
| F3 | Info | The banner survives a reload and back/forward on the registrant's own tab entry (M10/M13). This is the documented intent (`registrationSuccessState.ts`) and not forgeable cross-origin |

No functional defects found.
