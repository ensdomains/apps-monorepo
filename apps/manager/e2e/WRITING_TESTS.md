# Writing Stagehand E2E Tests

A practical guide for adding new tests to the manager app's E2E suite, based on how the existing registration and primaryName tests were built.

---

## 1. Set Up Your Environment Locally

Before writing anything, make sure you can run the existing tests against the app.

### Prerequisites

- Node.js + pnpm installed
- A Gemini API key (`GEMINI_API_KEY`) — Stagehand uses `google/gemini-2.5-flash` to resolve `act()` instructions
- Para test account credentials (`PARA_E2E_EMAIL`, `PARA_E2E_PIN`)
- The manager app running locally (or a staging URL)

### `.env` setup

Create or update `apps/manager/.env`:

```env
MANAGER_APP_URL=http://localhost:3000
PARA_E2E_EMAIL=test1@test.getpara.com
PARA_E2E_PIN=123456
GEMINI_API_KEY=your-key-here
```

### Run existing tests

```bash
cd apps/manager/e2e
pnpm exec playwright test
```

Tests run headfully locally so you can watch what happens. On CI they run headless.

---

## 2. Plan the Flow You Want to Test

Before touching any code, walk through the flow manually in the browser and write down each discrete user action. Be specific — Stagehand translates your plain-English instructions into DOM interactions, so the more precise you are, the more reliably it resolves.

**Good:**
> "Click the 'Edit Profile' button on the primetest.eth profile page"

**Too vague:**
> "Go to edit mode"

Things to note during your manual walkthrough:
- Which buttons/inputs are inside **Shadow DOM** (Para modals use `<cpsl-input>` web components — these need special handling, see below)
- Which steps require waiting for async state (transactions, network calls, modals closing)
- What console signals the app emits to indicate step completion

---

## 3. (Optional) Use Director.ai to Understand How Stagehand Resolves Actions

[director.ai](https://www.director.ai/) is a Stagehand-backed browser recorder. You don't need it to write tests, but it's a useful way to get familiar with how Stagehand translates interactions into `act()` instructions — especially if you're new to the framework.

Step through a flow there and you'll see output like:

```ts
// xpath=//input[@id="cpsl-input-0"]
await stagehand.act('Click the email input field to enter credentials.')

// xpath=/div/svg
await stagehand.act('Click the email submission arrow button.')
```

The XPath comments show exactly what Stagehand resolved each instruction to. This gives you intuition for how specific your `act()` descriptions need to be, and helps you spot cases where the resolved selector might be fragile. If you do use it to record a flow, you can paste the output into a `.spec.ts` as a starting point and adapt from there.

---

## 4. (Optional) Adapt the Director.ai Output

If you used Director.ai to record a flow, its output won't be production-ready as-is. Go through each step and ask:

### Does `stagehand.act()` actually work here?

Some elements can't be resolved by Stagehand's AI because they live inside **Shadow DOM** (the AI can't see inside web components). The Para email modal is the main example. If an `act()` step fails on a Shadow DOM element, replace it with a `page.evaluate()` helper:

```ts
// Instead of: await stagehand.act('Type my-email@example.com into the email field')
await fillParaEmailInput(page, PARA_EMAIL) // pierces Shadow DOM via evaluate()
```

See `helpers/wait-helpers.ts` for existing helpers. If you need a new one, follow the same pattern: `page.evaluate()` to traverse shadow roots and dispatch synthetic events.

### Are the sleeps right?

The directive inserts `await new Promise(resolve => setTimeout(resolve, N))` pauses. Check each one:

- **Too short** → step starts before the previous one finishes (modal not open yet, etc.)
- **Too long** → test is slower than necessary

Prefer `page.waitForLoadState('networkidle')` or `page.waitForSelector()` over fixed sleeps where the app gives you a reliable signal. Keep fixed sleeps only where there's no better option (e.g. Para modal animations).

### Are selectors stable?

The directive uses AI-resolved selectors cached by URL + instruction text. If your instruction is too generic it may match the wrong element. Make instructions unambiguous:

```ts
// Might match the wrong input
await stagehand.act('Click the search input.')

// Better — scopes it to a specific context
await stagehand.act('Click the first verification code input field in the "Verify Email" modal dialog.')
```

### Where should you use Playwright directly instead?

For actions that are specific enough to target with a stable selector, prefer Playwright's locator API over `stagehand.act()`. It's faster (no LLM call), more reliable, and easier to debug:

```ts
// Stagehand (slower, AI-dependent)
await stagehand.act('Click the X button next to the Ethereum address field')

// Playwright (fast, deterministic)
await page.waitForSelector('[aria-label="Remove Ethereum"]', { state: 'visible' })
await page.locator('[aria-label="Remove Ethereum"]').click()
```

Good candidates for direct Playwright selectors: aria-labeled buttons, dialog confirm buttons, elements with `data-testid`, elements with unique icon classes.

---

## 5. Handle Async Completion

### For on-chain transactions

The app emits console logs from the transaction manager and other machines. Set up a console listener **before** clicking the action that triggers the transaction, then await it after:

```ts
const waitForConsolePattern = (pattern: string, timeoutMs: number) =>
  new Promise<void>((resolve, reject) => {
    let done = false
    const id = setTimeout(() => {
      if (!done) reject(new Error(`Timeout waiting for console: "${pattern}"`))
    }, timeoutMs)
    page.on('console', (msg) => {
      if (!done && msg.text().includes(pattern)) {
        done = true
        clearTimeout(id)
        resolve()
      }
    })
  })

// Set up BEFORE clicking — don't miss fast completions
const txDone = waitForConsolePattern('[SAVE_RECORDS] Transaction completed:', 90_000)

await stagehand.act('Click Save')

await txDone
```

Key console patterns used in existing tests:

| Pattern | Meaning |
|---------|---------|
| `[SAVE_RECORDS] Transaction completed:` | Profile save / record update done |
| `[PRIMARY NAME] Cleared snapshot` | Primary name reverse record set |
| `[TRANSACTION MANAGER]` | Any transaction manager state change (used by `ConsoleMonitor`) |

For the registration flow, use `createConsoleMonitor()` from `helpers/console-monitor.ts` instead — it tracks the full transaction state machine.

### For UI-only flows

Use `page.waitForSelector()` or `page.waitForLoadState()`:

```ts
await page.waitForSelector('[role="dialog"]', { state: 'visible' })
await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
```

The `.catch(() => {})` on `networkidle` is intentional — some pages never fully quiesce (e.g. WebSocket connections), so it's safe to ignore the timeout there.

---

## 6. Structure the Test File

Copy the pattern from an existing test. The skeleton:

```ts
import { test } from '../fixtures/stagehand.fixture.js'
import { fillParaEmailInput, sleep } from '../helpers/wait-helpers.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PARA_EMAIL = process.env.PARA_E2E_EMAIL ?? 'test1@test.getpara.com'
const PARA_PIN = process.env.PARA_E2E_PIN ?? '123456'

test.describe('ENS <feature>', () => {
  test('<what it does>', async ({ stagehand }) => {
    test.setTimeout(300_000) // set if test involves transactions

    const page = stagehand.context.pages()[0]
    if (!page) throw new Error('No page in Stagehand context')

    // 1. Auth flow (copy from existing test)
    // 2. Navigate to target
    // 3. Set up console watchers (before triggering actions)
    // 4. Perform actions
    // 5. Await completion signals
  })
})
```

### Auth flow

Copy the auth block verbatim from `registration.spec.ts` or `primaryName.spec.ts`. It's intentionally inlined (not extracted) because it's timing-sensitive and the steps are tightly coupled to each other's completion.

---

## 7. Worked Example: Set Primary Name

Here's how the `sets a primary name via Para wallet` test was built, with reasoning for each decision.

### The goal

After logging in, navigate to `primetest.eth`, open Edit Profile, and set it as the primary name. This triggers two on-chain transactions:

1. **Tx 1** — `saveRecords`: sets the ETH address record on the resolver
2. **Tx 2** — Primary name machine: sets the reverse record

### The test, annotated

```ts
test('sets a primary name via Para wallet', async ({ stagehand }) => {
  // Auth + navigation + two transactions = well over 120s default.
  // 300s gives comfortable headroom.
  test.setTimeout(300_000)

  const page = stagehand.context.pages()[0]
  if (!page) throw new Error('No page in Stagehand context')

  // --- Auth flow ---
  // Copied verbatim from registration.spec.ts. Not extracted into a helper
  // because each step's timing is coupled to the previous step completing.
  await page.goto(MANAGER_APP_URL)
  await page.waitForLoadState('networkidle', 10000).catch(() => {})
  await sleep(2000)

  await stagehand.act('Click the "Connect" button in the top right.')
  await sleep(2500)

  // Para's email input lives inside a <cpsl-input> web component.
  // Stagehand's AI can't see inside Shadow DOM, so act() would fail here.
  // fillParaEmailInput() uses page.evaluate() to pierce the shadow root directly.
  await fillParaEmailInput(page, PARA_EMAIL)
  await sleep(2000)

  // After the value is filled, Stagehand CAN see and click the arrow button
  // (it's a visible DOM element, not inside Shadow DOM).
  await new Promise((resolve) => setTimeout(resolve, 2533))
  await stagehand.act('Click the email input field to enter credentials.')
  await new Promise((resolve) => setTimeout(resolve, 1920))
  await stagehand.act('Click the email submission arrow button.')

  // Wait for Para to send the OTP email (~10s).
  await new Promise((resolve) => setTimeout(resolve, 10000))

  // The instruction is deliberately specific: "in the Verify Email modal dialog"
  // prevents Stagehand from matching the main page search bar instead.
  await stagehand.act(
    `Click the first verification code input field in the "Verify Email" modal dialog.`,
  )
  await sleep(805)
  await stagehand.act(
    `Type "${PARA_PIN}" into the verification code input in the "Verify Email" modal, not into the search box.`,
  )

  await new Promise((resolve) => setTimeout(resolve, 10000))
  await stagehand.act('Click the "Sign in with Wallet" button.')
  await new Promise((resolve) => setTimeout(resolve, 10000))
  // --- End auth flow ---

  // Navigate to the target name.
  // stagehand.act() handles search + result click reliably here —
  // the elements are visible, not in Shadow DOM.
  await stagehand.act('click the search bar at the top')
  await stagehand.act('type "primetest.eth" into the search bar')
  await stagehand.act('click on the primetest.eth search result')
  await stagehand.act('click the Edit Profile button')
  await stagehand.act('click the Set Primary Name button')

  // Set up console watchers BEFORE clicking "Set as Primary".
  // If tx1 completes very fast and we set up the listener after clicking,
  // we'd miss the log and the promise would hang until timeout.
  //
  // Tx 1 and Tx 2 emit different signals because they're driven by different
  // XState machines: saveRecords and the primary name machine respectively.
  const waitForConsolePattern = (pattern: string, timeoutMs: number) =>
    new Promise<void>((resolve, reject) => {
      let done = false
      const id = setTimeout(() => {
        if (!done)
          reject(new Error(`Timeout waiting for console: "${pattern}"`))
      }, timeoutMs)
      page.on('console', (msg) => {
        if (!done && msg.text().includes(pattern)) {
          done = true
          clearTimeout(id)
          resolve()
        }
      })
    })

  const tx1Done = waitForConsolePattern(
    '[SAVE_RECORDS] Transaction completed:',
    60_000,
  )
  const tx2Done = waitForConsolePattern(
    '[PRIMARY NAME] Cleared snapshot',
    90_000,
  )

  // Now trigger the flow. Both watchers are already listening.
  await stagehand.act('click the Set as Primary button')

  await tx1Done
  console.log('[PrimaryName] ✅ Tx 1 complete: ETH address record updated')

  await tx2Done
  console.log('[PrimaryName] ✅ Tx 2 complete: Primary name set')
})
```

### Key decisions

| Decision | Reason |
|----------|--------|
| Para email filled via `fillParaEmailInput()` | Shadow DOM — `act()` can't reach `<cpsl-input>` internals |
| OTP modal instruction includes "in the Verify Email modal dialog" | Without this, Stagehand matched the main page search bar |
| Console watchers created before clicking "Set as Primary" | Race condition: tx could complete before listener attaches |
| Two separate console patterns for tx1 and tx2 | Different machines log different signals; both must complete |
| `test.setTimeout(300_000)` | Auth ~66s + navigation ~15s + tx1 ~60s + tx2 ~90s + buffer |

---

## 8. Iterate and Debug

Run your test in headed mode locally and watch it execute:

```bash
pnpm exec playwright test tests/your-test.spec.ts
```

Common issues and fixes:

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `act()` clicks the wrong element | Instruction too generic | Add more context to the instruction string |
| `act()` can't find element at all | Shadow DOM | Use `page.evaluate()` helper instead |
| Step fires before UI is ready | Sleep too short | Increase sleep or use `waitForSelector` |
| Console pattern never fires | Listener set up too late | Move `waitForConsolePattern` setup above the triggering click |
| Stale cached selector wrong after UI change | Old cache entry | Delete `e2e/cache/` and re-run |
| Test passes locally but fails CI | Timing difference (headless is faster) | Add a small sleep or `waitForSelector` around the flaky step |

### Clearing the cache

If you change the UI and existing `act()` instructions resolve to the wrong element:

```bash
rm -rf apps/manager/e2e/cache/
```

The next run will re-resolve all selectors via Gemini (slower, but re-populates the cache correctly).

---

## 9. Timeouts

Set `test.setTimeout()` to comfortably cover the full flow. Rough estimates:

| Phase | Time |
|-------|------|
| Para auth (login) | ~66s |
| Navigation + page load | ~15s |
| On-chain transaction (simple) | ~60s |
| On-chain transaction (2-step) | ~90s |

Add these up for your test and give yourself a 20–30% buffer. Tests that involve wallet auth + two transactions need at least 240s; the existing primary name tests use 300s.
