import type { FrameLocator, Page } from '@playwright/test'

/** Para auth runs inside an iframe from getpara.com. */
const PARA_IFRAME = "iframe[src*='app.beta.getpara.com']"

/** Get the Para iframe frame locator. */
export function paraFrame(page: Page): FrameLocator {
  return page.frameLocator(PARA_IFRAME)
}

/**
 * Fill the Para email input.
 * Playwright's frameLocator automatically pierces shadow DOM inside the iframe.
 */
export async function fillParaEmailInput(
  page: Page,
  email: string,
): Promise<void> {
  const frame = paraFrame(page)
  const emailInput = frame.locator('input[type="email"]')
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 })
  await emailInput.fill(email)
}

/**
 * Click the email submit/continue arrow button in the Para modal.
 * Targets the cpsl-button with data-testid="auth-start" inside the auth input.
 */
export async function clickParaEmailContinueButton(
  page: Page,
): Promise<void> {
  const frame = paraFrame(page)
  // Try the button inside the iframe first
  const continueButton = frame.locator(
    'button, cpsl-button[data-testid="auth-start"]',
  ).last()
  await continueButton.waitFor({ state: 'visible', timeout: 10_000 })
  await continueButton.click()
}

/**
 * Fill the Para OTP (6-digit verification code) inputs.
 * Para uses cpsl-code-input with individual input elements per digit.
 */
export async function fillParaOtpInput(
  page: Page,
  pin: string,
): Promise<void> {
  const digits = pin.slice(0, 6).split('')
  if (digits.length < 6) {
    throw new Error('fillParaOtpInput requires a 6-digit PIN')
  }

  const frame = paraFrame(page)
  const otpContainer = frame.locator(
    'cpsl-code-input[data-testid="portal-otp-input"]',
  )
  await otpContainer.waitFor({ state: 'visible', timeout: 15_000 })

  const inputs = otpContainer.locator('input')
  for (const [i, digit] of digits.entries()) {
    await inputs.nth(i).fill(digit)
  }
}

/**
 * Fill the Para password/PIN input.
 */
export async function fillParaPasswordInput(
  page: Page,
  password: string,
): Promise<void> {
  const frame = paraFrame(page)
  const passwordInput = frame.locator('input[type="password"]')
  await passwordInput.waitFor({ state: 'visible', timeout: 10_000 })
  await passwordInput.fill(password)
}

/**
 * Dismiss the app's BackendAuthModal (SIWE prompt) by clicking
 * "Skip for now" → "Skip Anyway". Idempotent: if the modal doesn't
 * appear within the timeout, returns silently.
 *
 * Why skip rather than complete:
 *   - SIWE requires reaching the backend API worker, which is not part
 *     of the e2e infra stack (we point at the deployed worker, which
 *     introduces external flakiness).
 *   - The modal blocks pointer events on the rest of the page; until
 *     it closes, no test can interact with anything else.
 *   - The modal appears AFTER `smartAccount.isAccountReady`, which on a
 *     fresh fork can take 30-60 s (Rhinestone SCA deploy + HCA
 *     registration + session enable). The helper therefore needs a
 *     generous wait window.
 *
 * Tests that want to exercise the SIWE flow itself should call
 * `signInBackendAuthModal` instead.
 */
export async function dismissBackendAuthModal(
  page: Page,
  options: { timeout?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 60_000

  // The verification step's title is "Verify your wallet".
  // The skip-confirmation step's title is "Are you sure?".
  // We key off the "Skip for now" cancel button which is only present
  // in the verification step.
  const skipBtn = page.getByRole('button', { name: 'Skip for now' })

  try {
    await skipBtn.waitFor({ state: 'visible', timeout })
  } catch {
    // Modal never appeared — already skipped/dismissed, EOA-only mode,
    // or feature disabled. Either way, nothing to do.
    console.log(
      '[para-auth] BackendAuthModal did not appear within timeout — skipping',
    )
    return
  }

  console.log('[para-auth] BackendAuthModal visible — clicking "Skip for now"')
  await skipBtn.click()

  // The skip-confirmation step replaces the modal contents but keeps
  // the dialog open. Click "Skip Anyway" to fully dismiss.
  const skipAnywayBtn = page.getByRole('button', { name: 'Skip Anyway' })
  await skipAnywayBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await skipAnywayBtn.click()

  // Wait for the dialog overlay to disappear so subsequent navigations
  // are clean and pointer-events on the page are restored.
  const overlay = page.locator('[data-slot="alert-dialog-overlay"]')
  await overlay
    .waitFor({ state: 'hidden', timeout: 10_000 })
    .catch(() => {
      // Best-effort: if the overlay lingers, downstream interactions
      // will hit retry logic via Playwright's auto-waiting anyway.
    })

  console.log('[para-auth] BackendAuthModal dismissed')
}

/**
 * Complete the app's BackendAuthModal (SIWE prompt) by signing the
 * message with the connected wallet. Use this only when the test
 * specifically exercises the SIWE / backend-auth flow.
 *
 * Returns silently if the modal does not appear within `timeout`.
 */
export async function signInBackendAuthModal(
  page: Page,
  options: { timeout?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 60_000

  // The button stays disabled until the wagmi walletClient is ready,
  // so we explicitly wait for the enabled state rather than just
  // visible.
  const signInBtn = page.getByRole('button', { name: 'Sign in with Wallet' })

  try {
    await signInBtn.waitFor({ state: 'visible', timeout })
  } catch {
    console.log(
      '[para-auth] BackendAuthModal did not appear within timeout — skipping SIWE',
    )
    return
  }

  // Wait for the button to become enabled (walletClient resolved).
  await signInBtn.waitFor({ state: 'attached', timeout: 10_000 })
  for (let i = 0; i < 30; i += 1) {
    if (await signInBtn.isEnabled()) break
    await page.waitForTimeout(500)
  }

  console.log(
    '[para-auth] BackendAuthModal visible — clicking "Sign in with Wallet"',
  )
  await signInBtn.click()

  // The modal closes once `backendAuthStore.authKey` is populated.
  await signInBtn
    .waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => {
      console.warn(
        '[para-auth] BackendAuthModal did not close after Sign in — backend may be unreachable',
      )
    })

  const overlay = page.locator('[data-slot="alert-dialog-overlay"]')
  await overlay
    .waitFor({ state: 'hidden', timeout: 10_000 })
    .catch(() => {})
}

/**
 * Full Para authentication flow: email → OTP.
 *
 * Does NOT handle the post-auth app modals (EnableSessions,
 * BackendAuthModal) — those are app-level and should be handled by
 * the test fixture so each spec can choose what to do with them.
 */
export async function authenticateWithPara(
  page: Page,
  options: { email: string; pin: string },
): Promise<void> {
  const { email, pin } = options

  // Click Connect button
  const connectButton = page.getByRole('button', { name: /connect/i })
  await connectButton.waitFor({ state: 'visible', timeout: 15_000 })
  await connectButton.click()

  // Fill email and submit
  const emailInput = page.locator('input[id="cpsl-input-0"]')
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 })
  await emailInput.fill(email)

  const continueBtn = page
    .locator('cpsl-button[slot="end"]')
    .last()
  await continueBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await continueBtn.click()

  // Fill OTP
  await fillParaOtpInput(page, pin)
}
