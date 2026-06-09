import { expect, type Page } from '@playwright/test'
import {
  type Web3ProviderBackend,
  Web3RequestKind,
} from '@ensdomains/headless-web3-provider'

// ---------------------------------------------------------------------------
// Connect wallet (RainbowKit + headless web3 provider)
// ---------------------------------------------------------------------------

/**
 * Auto-authorize message-signing only (SIWE / typed-data). NOT
 * `eth_sendTransaction` — the specs authorize those explicitly via
 * `authorizeTransaction`, and auto-permitting would break that handshake.
 */
export const PERMITTED_SIGN_KINDS = [
  Web3RequestKind.SignMessage,
  Web3RequestKind.SignTypedData,
  Web3RequestKind.SignTypedDataV1,
  Web3RequestKind.SignTypedDataV3,
  Web3RequestKind.SignTypedDataV4,
] as const

/**
 * Select "Headless Web3 Provider" in an already-open sign-in dialog and
 * authorize the queued permission + account requests.
 *
 * The app's LoginDialog (Privy social login + wagmi external wallets) lists
 * EIP-6963-discovered injected wallets; the e2e headless provider announces
 * itself as "Headless Web3 Provider" and is selected here. Use this when the
 * dialog is already open (e.g. the pricing page's connect button); for the
 * nav-bar flow use {@link connectWithHeadlessWallet} which opens it first.
 */
export async function authorizeHeadlessConnection(
  page: Page,
  wallet: Web3ProviderBackend,
): Promise<void> {
  const headlessOption = page.getByText('Headless Web3 Provider')
  await headlessOption.waitFor({ state: 'visible', timeout: 10_000 })
  await headlessOption.click()

  // Selecting the wallet triggers wagmi's injected connector, which asks the
  // provider to confirm — authorize programmatically. The headless provider
  // queues RequestPermissions then RequestAccounts.
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
 * Connect the headless web3 wallet through the manager's sign-in dialog.
 *
 * Flow:
 *  1. Click the "Connect" button in the nav bar
 *  2. Select "Headless Web3 Provider" from the LoginDialog wallet list
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
  // clickable before the dialog handler hydrates, so the first click is
  // sometimes a no-op and the dialog never opens. Retry opening until the
  // dialog (with the injected-provider entry) appears — this also absorbs
  // any EIP-6963 discovery delay.
  const modal = page.getByRole('dialog')
  const headlessOption = page.getByText('Headless Web3 Provider')
  await expect(async () => {
    if (!(await modal.isVisible().catch(() => false))) {
      await connectButton.click({ timeout: 5_000 }).catch(() => {})
    }
    await expect(headlessOption).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 40_000 })

  await authorizeHeadlessConnection(page, wallet)

  await expect(connectButton).not.toBeVisible({ timeout: 15_000 })
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
    await overlay.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
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
  await overlay.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
}

// ---------------------------------------------------------------------------
// Transaction helpers (re-exported from portal-auth for convenience)
// ---------------------------------------------------------------------------
// In EOA mode the manager submits registration transactions through the
// connected headless wallet just like the portal app, so the same
// authorize helpers apply.
export {
  authorizeTransaction,
  authorizeTransactions,
} from './portal-auth.js'
