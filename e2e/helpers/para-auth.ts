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
 * Click the modal action to complete auth.
 * Supports the new session-enable flow and the legacy wallet sign-in flow.
 */
export async function clickParaSignInButton(page: Page): Promise<void> {
  const enableSessionsButton = page.getByText("Enable Sessions")
  await enableSessionsButton.waitFor({ state: 'visible', timeout: 10_000 })
  await enableSessionsButton.click()


  const signInButton = page.getByText("Sign in with Wallet")
  await signInButton.waitFor({ state: 'visible', timeout: 60_000 })
  await signInButton.click()
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
