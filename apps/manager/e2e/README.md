# ENS Manager App — Stagehand E2E Tests

## Overview

The E2E test suite lives in `apps/manager/e2e/` and uses **Playwright as the test runner** with **Stagehand** handling browser automation via natural-language `act()` instructions. Tests run against a live manager app instance.

---

## Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Test runner | Playwright | Orchestration, assertions, config |
| Browser automation | Stagehand (`@browserbasehq/stagehand`) | Natural-language `act()` commands |
| AI model | `google/gemini-2.5-flash` | Resolves `act()` instructions to DOM actions |
| Wallet | Para (email-based) | Signs transactions in-browser |

**Config**: `playwright.config.ts` — single worker, no parallelism, retries on CI only.

---

## Stagehand Fixture

`fixtures/stagehand.fixture.ts`

Each test gets a fresh `Stagehand` instance via a Playwright fixture. Key settings:

- **`env: 'LOCAL'`** — runs a local Chromium browser (not BrowserBase cloud)
- **`cacheDir: ../cache/registration`** — caches resolved `act()` selectors so repeated runs are faster; cache key includes the page URL
- **`headless: true` on CI**, visible locally
- Model falls back to `google/gemini-2.5-flash` whether or not `GEMINI_API_KEY` is set in env

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MANAGER_APP_URL` | `http://localhost:3000` | Target app URL |
| `PARA_E2E_EMAIL` | `test1@test.getpara.com` | Test wallet email |
| `PARA_E2E_PIN` | `123456` | OTP / verification code |
| `E2E_DOMAIN` | `e2e-{timestamp}.eth` | Domain to register (fixed = cache reuse) |
| `GEMINI_API_KEY` | — | Gemini API key for Stagehand AI model |

---

## Shared Authentication Flow

Both test suites log in with the same Para email wallet sequence. The auth flow is inlined in each test for reliability rather than extracted into a helper.

### Steps

1. Navigate to app, wait for load
2. `stagehand.act('Click the "Connect" button...')`
3. **Fill email via `fillParaEmailInput()`** — Para uses web components (`<cpsl-input>`) with Shadow DOM that `stagehand.act()` cannot reach directly; this helper uses `page.evaluate()` to pierce the shadow root and dispatch synthetic input/change events
4. Click email field again, then click the arrow submit button via `stagehand.act()` (Stagehand can click these after the value is already filled)
5. Wait ~10s for OTP email
6. Click the OTP input and type the PIN — careful to target the modal, not the main search bar
7. Click "Sign in with Wallet"
8. Wait ~10s for wallet to initialize

### Shadow DOM Workaround

Para's `<cpsl-input>` element renders its `<input type="email">` inside a shadow root. `stagehand.act()` fails here because Gemini can't see shadow DOM content. The workaround:

- **`fillParaEmailInput(page, email)`** — traverses `document.querySelectorAll('cpsl-input')`, pierces each `.shadowRoot`, finds the email `<input>`, and dispatches `input` + `change` events (`helpers/wait-helpers.ts`)
- After the value is set, `stagehand.act()` can click the arrow button normally since Stagehand sees the visible button element

---

## Test Suite: Registration

**File**: `tests/registration.spec.ts`

### What It Tests

Full ENS name registration flow with stablecoin (USDC) payment.

### Steps After Auth

1. Search for `E2E_DOMAIN` in the header search bar
2. Click the search result
3. Change registration duration to 2 years ($10 USD)
4. Click "Pay with Stablecoins" → select USDC
5. Click "Confirm Payment"
6. Start `ConsoleMonitor` **before** clicking "BUY NAME" to capture all transaction logs
7. Click "BUY NAME"
8. Wait for `monitor.waitForRegistrationComplete(120_000)` — polls for `success` state in console logs
9. Assert `monitor.getLastState() === 'success'`

### ConsoleMonitor

`helpers/console-monitor.ts`

Listens to `page.on('console')` for messages prefixed with `[TRANSACTION MANAGER]` or `[REGISTRATION IN PROGRESS]`. Normalizes raw log text into typed states:

```
idle → committing → approving → registering → success | error
```

`waitForRegistrationComplete()` polls every 500ms until `success` appears (or times out / hits `error`).

---

## Test Suite: Primary Name

**File**: `tests/primaryName.spec.ts`

Timeout: **300 seconds** per test (login ~66s + navigation ~15s + two on-chain transactions).

### Test 1: Set Primary Name

Sets `primetest.eth` as the primary ENS name for the connected wallet. Requires two on-chain transactions:

| Tx | Machine | Console signal |
|----|---------|----------------|
| 1 | `saveRecords` — sets ETH address record on resolver | `[SAVE_RECORDS] Transaction completed:` |
| 2 | Primary name machine — sets reverse record | `[PRIMARY NAME] Cleared snapshot` |

**Steps after auth:**

1. Search for `primetest.eth`
2. Click the result
3. Click "Edit Profile"
4. Click "Set Primary Name"
5. Set up **two** `waitForConsolePattern` promises **before** clicking confirm (to avoid missing fast messages)
6. Click "Set as Primary"
7. `await tx1Done` → log success
8. `await tx2Done` → log success

### Test 2: Remove ETH Record

Removes the ETH address record from `primetest.eth`'s profile. This is a cleanup test that undoes what Test 1 sets up, ensuring Test 1 can run again cleanly.

**Steps after auth:**

1. Search for `primetest.eth`, click result with "Registered" label
2. Click "Edit Profile", wait for `networkidle`
3. Set up `waitForConsolePattern` for `[SAVE_RECORDS] Transaction completed:` **before** clicking Save
4. Use `page.waitForSelector('[aria-label="Remove Ethereum"]')` + `.click()` — direct Playwright locator (more reliable than `stagehand.act()` for specific aria-labeled buttons)
5. Click Save (dialog trigger with `.lucide-save` icon)
6. Confirm in the confirmation dialog
7. `await txDone` → log success

---

## Helper Utilities

### `sleep(ms)`

Simple `Promise`-based delay. Used throughout for timing gaps where `networkidle` or `stagehand.act()` completion isn't sufficient (e.g. waiting for Para modal animations).

### `fillParaEmailInput(page, email)`

Shadow DOM piercing helper for Para's `<cpsl-input>`. Tries all `cpsl-input` elements on the page, finds the one with an email `<input>` in its shadow root, fills it, and dispatches synthetic events.

### `waitForConsolePattern(pattern, timeoutMs)`

Inlined in primaryName tests (not exported). Wraps `page.on('console')` in a promise that resolves when a matching string appears in any console message, and rejects on timeout.

---

## Running the Tests

```bash
# From apps/manager/e2e/
pnpm exec playwright test

# Against a specific app URL
MANAGER_APP_URL=https://staging.example.com pnpm exec playwright test

# With a fixed domain for cache reuse
E2E_DOMAIN=e2e-ci.eth pnpm exec playwright test registration
```

---

## Known Limitations & Quirks

- **Fixed `sleep()` calls** are used because Para's modal animations and blockchain confirmations don't expose reliable completion signals. These should be revisited if the tests become flaky.
- **Action caching** speeds up repeated runs but can cause stale cached selectors if the UI changes. Delete `e2e/cache/` to force fresh resolution.
- **Single worker** (`workers: 1`) is required — tests share a browser instance and Para wallet state, so parallel execution would cause auth conflicts.
- `waitForConsolePattern` is **set up before** the triggering click in primaryName tests to avoid a race condition where fast transactions could complete before the listener is attached.
