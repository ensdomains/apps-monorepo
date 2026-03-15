# Writing E2E Tests

A practical guide for adding new tests to the E2E suite using Playwright.

---

## 1. Set Up Your Environment

### Prerequisites

- Node.js + pnpm installed
- Para test account credentials (`PARA_E2E_EMAIL`, `PARA_E2E_PIN`)
- The target app running locally (or a staging URL)

### `.env` setup

Create or update `e2e/.env`:

```env
MANAGER_APP_URL=http://localhost:3000
PORTAL_APP_URL=http://localhost:3001
PARA_E2E_EMAIL=test1@test.getpara.com
PARA_E2E_PIN=123456
```

### Run existing tests

```bash
pnpm e2e:manager
```

Tests run headfully locally so you can watch what happens. On CI they run headless.

---

## 2. Plan the Flow

Walk through the flow manually in the browser and note:

- Which buttons/inputs to target (inspect the DOM for stable selectors)
- Which steps require waiting for async state (transactions, modals)
- What console signals the app emits for step completion

Use Playwright's codegen to discover selectors:

```bash
npx playwright codegen http://localhost:3000
```

---

## 3. Use Playwright Agents to Scaffold Tests

Playwright Agents (`.claude/agents/`) are dev-time AI tools that generate standard Playwright code. They do NOT run at test time.

### Workflow

1. **Plan**: Describe the test flow in plain English. The **planner agent** creates a structured test plan in `specs/`.

2. **Generate**: The **generator agent** turns the plan into a working `@playwright/test` spec.

3. **Heal**: If a test breaks due to UI changes, the **healer agent** inspects the error and updates selectors.

Invoke agents via Claude Code or VS Code Copilot. The agents have access to your codebase and understand the project's patterns.

### Example prompt for the generator

> "Generate a Playwright test that logs in with Para, navigates to the profile page for primetest.eth, updates the avatar, and waits for the transaction console log before asserting the new avatar is visible."

---

## 4. Write the Test

### Test file skeleton

```ts
import { test, expect } from '@playwright/test'
import { authenticateWithPara } from '../../../helpers/para-auth.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PARA_EMAIL = process.env.PARA_E2E_EMAIL ?? 'test1@test.getpara.com'
const PARA_PIN = process.env.PARA_E2E_PIN ?? '123456'

test.describe('ENS <feature>', () => {
  test('<what it does>', async ({ page }) => {
    test.setTimeout(300_000) // set if test involves transactions

    // 1. Navigate and authenticate
    await page.goto(MANAGER_APP_URL)
    await page.waitForLoadState('networkidle').catch(() => {})
    await authenticateWithPara(page, { email: PARA_EMAIL, pin: PARA_PIN })

    // 2. Navigate to target
    // 3. Set up console watchers (before triggering actions)
    // 4. Perform actions with Playwright locators
    // 5. Await completion signals and assert
  })
})
```

### Para authentication

Use `authenticateWithPara(page, { email, pin })` from `helpers/para-auth.ts`. This handles:

1. Clicking the Connect button
2. Filling email in the Para iframe (shadow DOM)
3. Clicking the continue button
4. Filling the OTP code
5. Clicking "Sign in with Wallet"

### Playwright locator patterns

```ts
// By role (preferred)
await page.getByRole('button', { name: /edit profile/i }).click()

// By placeholder
await page.getByPlaceholder(/search/i).fill('myname.eth')

// By text content
await page.getByText('primetest.eth').click()

// By CSS selector (when no better option)
await page.locator('[aria-label="Remove Ethereum"]').click()

// Para iframe + shadow DOM (automatic piercing)
const frame = page.frameLocator("iframe[src*='app.beta.getpara.com']")
await frame.locator('input[type="email"]').fill(email)
```

---

## 5. Handle Async Completion

### On-chain transactions

Set up a console listener **before** clicking the action that triggers the transaction:

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
await page.getByRole('button', { name: /save/i }).click()
await txDone
```

For the registration flow, use `createConsoleMonitor()` from `helpers/console-monitor.ts` — it tracks the full transaction state machine.

### UI-only flows

```ts
await page.waitForSelector('[role="dialog"]', { state: 'visible' })
await page.waitForLoadState('networkidle').catch(() => {})
```

---

## 6. Debugging

```bash
# Run with headed browser
pnpm e2e:manager

# Run a specific test
npx playwright test --config=projects/manager/playwright.config.ts -g "registers a name"

# View trace from a failed run
npx playwright show-trace test-results/<test-name>/trace.zip
```

Common issues:

| Symptom | Fix |
|---------|-----|
| Element not found | Inspect DOM for the right selector; use `waitFor()` before interacting |
| Clicks wrong element | Make the locator more specific (add role, name, or aria-label) |
| Console pattern never fires | Move `waitForConsolePattern` setup above the triggering click |
| Test passes locally, fails CI | Add `waitFor()` or short `sleep()` around the flaky step |

---

## 7. Timeouts

Set `test.setTimeout()` to cover the full flow:

| Phase | Time |
|-------|------|
| Para auth (login) | ~30s |
| Navigation + page load | ~15s |
| On-chain transaction (simple) | ~60s |
| On-chain transaction (2-step) | ~90s |

Add these up and give a 20–30% buffer.

---

## 8. Optional: Stagehand for Prototyping

Stagehand (`fixtures/stagehand.fixture.ts`) is available as a dev dependency for prototyping new test flows with natural-language `act()` instructions. Once the flow is validated, convert it to pure Playwright locators.

```ts
// Prototyping (dev only — not for CI)
import { test } from '../../../fixtures/stagehand.fixture.js'
test('prototype', async ({ stagehand }) => {
  const page = stagehand.context.pages()[0]
  await stagehand.act('Click the Edit Profile button')
})
```

Requires `GEMINI_API_KEY` or an LLM API key in `.env`.
