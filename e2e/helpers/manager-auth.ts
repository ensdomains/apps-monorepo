import { expect, type Page } from '@playwright/test'
import {
  type Web3ProviderBackend,
  Web3RequestKind,
} from '@ensdomains/headless-web3-provider'

// ---------------------------------------------------------------------------
// Connect wallet (Privy modal + headless web3 provider)
// ---------------------------------------------------------------------------

/**
 * Auto-authorize message-signing and chain-switching. NOT `eth_sendTransaction`
 * — the specs authorize those explicitly via `authorizeTransaction`, and
 * auto-permitting would break that handshake.
 *
 * `SwitchEthereumChain` is required: the Rhinestone SDK calls
 * `walletClient.switchChain()` inside `signWithOwners` before each
 * `eth_signTypedData_v4` call. Without it the authorize middleware queues the
 * request and the signing loop hangs indefinitely.
 */
export const PERMITTED_SIGN_KINDS = [
  Web3RequestKind.SignMessage,
  Web3RequestKind.SignTypedData,
  Web3RequestKind.SignTypedDataV1,
  Web3RequestKind.SignTypedDataV3,
  Web3RequestKind.SignTypedDataV4,
  Web3RequestKind.SwitchEthereumChain,
] as const

/**
 * Select "Headless Web3 Provider" in an already-open Privy modal and
 * authorize the queued permission + account requests.
 *
 * Use this when a connect modal has already been opened (e.g. the pricing
 * page's "Connect or sign in to register" button). For the nav-bar connect
 * flow, use {@link connectWithHeadlessWallet} which opens the modal first.
 */
export async function authorizeHeadlessConnection(
  page: Page,
  wallet: Web3ProviderBackend,
): Promise<void> {
  // Privy's first login screen offers social + "Continue with a wallet"; the
  // injected EIP-6963 wallet ("Headless Web3 Provider") lives behind that
  // button, so step into the wallet list first.
  const continueWithWallet = page.getByRole('button', {
    name: /continue with a wallet/i,
  })
  await continueWithWallet.waitFor({ state: 'visible', timeout: 15_000 })
  await continueWithWallet.click()

  const headlessOption = page.getByText('Headless Web3 Provider')
  await headlessOption.waitFor({ state: 'visible', timeout: 10_000 })
  await headlessOption.click()

  // Privy asks the provider to confirm — authorize programmatically.
  // The headless provider queues RequestPermissions then RequestAccounts.
  await expect
    .poll(
      () => wallet.getPendingRequestCount(Web3RequestKind.RequestPermissions),
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(1)
  await wallet.authorize(Web3RequestKind.RequestPermissions)

  await expect
    .poll(() => wallet.getPendingRequestCount(Web3RequestKind.RequestAccounts), {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(1)
  await wallet.authorize(Web3RequestKind.RequestAccounts)
}

/**
 * Connect the headless web3 wallet through the manager's Privy modal.
 *
 * Flow:
 *  1. Click the "Connect" button in the nav bar
 *  2. Select "Headless Web3 Provider" from Privy's wallet list
 *  3. Authorize the wallet_requestPermissions + eth_requestAccounts calls
 *
 * After this resolves the wallet is connected and the nav "Connect" button
 * is gone. The smart-account machine then initialises asynchronously — the
 * EnableSessions / BackendAuth modals are handled by the fixture.
 */
export async function connectWithHeadlessWallet(
  page: Page,
  wallet: Web3ProviderBackend,
): Promise<void> {
  // The desktop nav button renders "Connect" plus an MSymbol "login" icon
  // whose ligature text folds into the accessible name ("Connect login");
  // the mobile button is just "Connect". Match either, anchored so it never
  // catches "Disconnect" / "Connect to register" / "Connect Wallet".
  const connectButton = page.getByRole('button', {
    name: /^connect( login)?$/i,
  })
  await connectButton.waitFor({ state: 'visible', timeout: 15_000 })

  // The manager is an SSR app: the server-rendered Connect button can be
  // clickable before wagmi/Privy hydrate `openConnectModal`, so the first
  // click is sometimes a no-op and the modal never opens. Retry opening until
  // Privy's login dialog (its "Continue with a wallet" entry) appears.
  const continueWithWallet = page.getByRole('button', {
    name: /continue with a wallet/i,
  })
  await expect(async () => {
    if (!(await continueWithWallet.isVisible().catch(() => false))) {
      await connectButton.click({ timeout: 5_000 }).catch(() => {})
    }
    await expect(continueWithWallet).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 40_000 })

  await authorizeHeadlessConnection(page, wallet)

  await expect(connectButton).not.toBeVisible({ timeout: 15_000 })
}

/**
 * Log in with a Privy test account (email + deterministic OTP) — exercises the
 * real social/email login UX instead of an injected wallet. Credentials come
 * from PRIVY_TEST_EMAIL / PRIVY_TEST_OTP (Privy Dashboard → User management →
 * Authentication → Advanced → test accounts); the OTP is fixed, so no real
 * OAuth or inbox is involved.
 *
 * Note: this connects Privy's embedded wallet (a fresh address), not the funded
 * Anvil account — use it for login/connection coverage, not on-chain tx specs.
 */
export async function connectWithPrivyTestAccount(page: Page): Promise<void> {
  const email = process.env.PRIVY_TEST_EMAIL
  const otp = process.env.PRIVY_TEST_OTP
  if (!email || !otp) {
    throw new Error(
      'connectWithPrivyTestAccount requires PRIVY_TEST_EMAIL and PRIVY_TEST_OTP',
    )
  }

  const connectButton = page.getByRole('button', {
    name: /^connect( login)?$/i,
  })
  await connectButton.waitFor({ state: 'visible', timeout: 15_000 })

  // Open Privy's login and reach the email field (retry through hydration).
  const emailInput = page.locator('#privy-dialog input[type="email"]')
  await expect(async () => {
    if (!(await emailInput.isVisible().catch(() => false))) {
      await connectButton.click({ timeout: 5_000 }).catch(() => {})
    }
    await expect(emailInput).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 40_000 })

  await emailInput.fill(email)
  await emailInput.press('Enter')

  // OTP screen: six single-digit numeric inputs; focus the first and type the
  // code (each digit advances to the next box).
  const firstOtp = page
    .locator('#privy-dialog input[inputmode="numeric"]')
    .first()
  await firstOtp.waitFor({ state: 'visible', timeout: 15_000 })
  await firstOtp.click()
  await page.keyboard.type(otp)

  await expect(connectButton).not.toBeVisible({ timeout: 30_000 })
}

/**
 * Click through the "Enable Smart Sessions" modal that appears after the
 * smart account initialises. Idempotent: returns silently if it never shows
 * (sessions already enabled or feature flag off).
 *
 * The modal is a Radix `Dialog`, so its overlay slot is `dialog-overlay` —
 * NOT `alert-dialog-overlay`, which belongs to the BackendAuth dialog. We
 * wait for that exact overlay to disappear so the test doesn't race forward
 * while the session dialog is still closing (and still blocking the page).
 */
export async function clickThroughEnableSessions(page: Page): Promise<void> {
  const enableBtn = page.getByRole('button', { name: /enable sessions/i })
  try {
    await enableBtn.waitFor({ state: 'visible', timeout: 30_000 })
    await enableBtn.click()
    const overlay = page.locator('[data-slot="dialog-overlay"]')
    await overlay.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => { })
  } catch {
    // Modal never appeared — sessions already enabled or feature flag off.
  }
}

// ---------------------------------------------------------------------------
// Backend auth modal (SIWE) — app-level, independent of the connect method
// ---------------------------------------------------------------------------

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
      '[manager-auth] BackendAuthModal did not appear within timeout — skipping',
    )
    return
  }

  console.log(
    '[manager-auth] BackendAuthModal visible — clicking "Skip for now"',
  )
  await skipBtn.click()

  // The skip-confirmation step replaces the modal contents but keeps
  // the dialog open. Click "Skip Anyway" to fully dismiss.
  const skipAnywayBtn = page.getByRole('button', { name: 'Skip Anyway' })
  await skipAnywayBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await skipAnywayBtn.click()

  // Wait for the dialog overlay to disappear so subsequent navigations
  // are clean and pointer-events on the page are restored.
  const overlay = page.locator('[data-slot="alert-dialog-overlay"]')
  await overlay.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {
    // Best-effort: if the overlay lingers, downstream interactions
    // will hit retry logic via Playwright's auto-waiting anyway.
  })

  console.log('[manager-auth] BackendAuthModal dismissed')
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
      '[manager-auth] BackendAuthModal did not appear within timeout — skipping SIWE',
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
    '[manager-auth] BackendAuthModal visible — clicking "Sign in with Wallet"',
  )
  await signInBtn.click()

  // The modal closes once `backendAuthStore.authKey` is populated.
  await signInBtn.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {
    console.warn(
      '[manager-auth] BackendAuthModal did not close after Sign in — backend may be unreachable',
    )
  })

  const overlay = page.locator('[data-slot="alert-dialog-overlay"]')
  await overlay.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => { })
}

// ---------------------------------------------------------------------------
// Transaction helpers
// ---------------------------------------------------------------------------
// These live here rather than re-exporting from portal-auth because the
// manager uses Rhinestone (intent-based signing) while the portal is pure
// EOA.  In the Rhinestone flow only the USDC approval is a plain
// eth_sendTransaction; resolver/commit/register are eth_signTypedData_v4
// intents that are auto-authorized via PERMITTED_SIGN_KINDS.  Owning these
// helpers directly lets us add Rhinestone-specific overloads without
// touching portal infrastructure.

/**
 * Authorize a pending `eth_sendTransaction` in the headless wallet.
 *
 * In the Rhinestone registration flow this is only called once — for the
 * ERC-20 USDC approval.  Intents (resolver deploy, commit, register) are
 * `eth_signTypedData_v4` and are auto-authorized via `PERMITTED_SIGN_KINDS`.
 */
export async function authorizeTransaction(
  wallet: Web3ProviderBackend,
  timeoutMs = 60_000,
): Promise<void> {
  const result = await Promise.race([
    wallet.authorize(Web3RequestKind.SendTransaction),
    new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), timeoutMs),
    ),
  ])

  if (result === 'timeout') {
    throw new Error(
      `authorizeTransaction timed out after ${timeoutMs}ms waiting for SendTransaction`,
    )
  }
}

/**
 * Wait for and authorize multiple sequential `eth_sendTransaction` requests.
 */
export async function authorizeTransactions(
  wallet: Web3ProviderBackend,
  count: number,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await authorizeTransaction(wallet)
  }
}
