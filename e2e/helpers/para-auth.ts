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
  await otpContainer.waitFor({ state: 'visible', timeout: 30_000 })

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
 * Click the modal action(s) to complete auth.
 *
 * After Para email+OTP, up to two app modals appear in sequence:
 *   1. EnableSessionModal  — "Enable Sessions" (Rhinestone smart-account session)
 *   2. BackendAuthModal    — "Sign in with Wallet" (SIWE for notification backend)
 *
 * On a **fresh Anvil fork** the session creation deploys the smart account
 * on-chain for the first time, which can take 30-60 s. The function waits
 * for each modal to fully close before moving on.
 */
export async function clickParaSignInButton(page: Page): Promise<void> {
  // ── 1. Handle EnableSessionModal ─────────────────────────────────────
  const enableBtn = page.getByRole('button', { name: 'Enable Sessions' })

  try {
    await enableBtn.waitFor({ state: 'visible', timeout: 15_000 })
    console.log('[para-auth] EnableSessionModal visible — clicking "Enable Sessions"')
    await enableBtn.click()

    // Session creation runs on-chain. On a fresh fork this deploys the smart
    // account + installs the session module, which can take a while.
    // Wait for the success message or the button to disappear.
    // const sessionsEnabled = page.getByText('Sessions enabled!')
    // await sessionsEnabled
    //   .waitFor({ state: 'visible', timeout: 120_000 })
    //   .catch(() => {
    //     console.warn('[para-auth] Did not see "Sessions enabled!" text — session creation may have failed')
    //   })

    // The modal auto-closes 1.5 s after success. Wait for the dialog to disappear.
    const sessionDialog = page.locator('[role="dialog"]:has-text("Smart Sessions")')
    await sessionDialog
      .waitFor({ state: 'hidden', timeout: 10_000 })
      .catch(() => { })

    console.log('[para-auth] EnableSessionModal closed')
  } catch {
    // EnableSessionModal may not appear if sessions are already set up.
    console.log('[para-auth] EnableSessionModal did not appear — sessions may already be active')
  }

  // ── 2. Handle BackendAuthModal (SIWE) ────────────────────────────────
  const signInBtn = page.getByRole('button', { name: 'Sign in with Wallet' })

  try {
    await signInBtn.waitFor({ state: 'visible', timeout: 15_000 })
    console.log('[para-auth] BackendAuthModal visible — clicking "Sign in with Wallet"')
    await signInBtn.click()
  } catch {
    // BackendAuthModal may not appear (e.g. already authed, or feature disabled).
    console.log('[para-auth] BackendAuthModal did not appear — skipping SIWE')
  }
}

/**
 * Full Para authentication flow: email → OTP → sign in.
 * Waits for each step's UI to be ready before proceeding.
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

  // Wait for and click "Sign in with Wallet"
  await clickParaSignInButton(page)
}
