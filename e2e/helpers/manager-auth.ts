import { expect, type Page } from '@playwright/test'
import {
  type Web3ProviderBackend,
  Web3RequestKind,
} from '@ensdomains/headless-web3-provider'

// ---------------------------------------------------------------------------
// Connect wallet
// ---------------------------------------------------------------------------

/**
 * Connect the headless web3 wallet to the manager app.
 *
 * The manager app uses Para SDK for wallet connection. When the headless
 * wallet is injected with `isMetaMask` spoofed to `true`, Para's modal
 * exposes a MetaMask option that routes through `window.ethereum` — which
 * is the headless provider.
 *
 * Flow:
 *  1. Click the manager's "Connect" button (opens Para modal)
 *  2. Click the MetaMask option inside the Para modal
 *  3. Programmatically authorize wallet_requestPermissions then eth_requestAccounts
 *
 * The `injectHeadlessWeb3Provider` call in the fixture MUST precede page
 * navigation so that the EIP-6963 / window.ethereum injection runs before
 * Para initialises. Additionally, `page.addInitScript` is used to patch
 * `isMetaMask = true` so Para detects it as a MetaMask-compatible provider.
 */
export async function connectWithHeadlessWalletManager(
  page: Page,
  wallet: Web3ProviderBackend,
): Promise<void> {
  // 1. Click the manager's Connect button (opens Para modal)
  const connectButton = page.getByRole('button', { name: /connect/i })
  await connectButton.waitFor({ state: 'visible', timeout: 15_000 })
  await connectButton.click()

  // 2. Select MetaMask from Para's external wallet section.
  //    Para renders external wallet buttons inside its modal iframe or
  //    as standard DOM buttons — use a broad text match.
  const metaMaskOption = page.getByRole('button', { name: /metamask/i })
  await metaMaskOption.waitFor({ state: 'visible', timeout: 10_000 })
  await metaMaskOption.click()

  // 3. Authorize wallet_requestPermissions (if queued) then eth_requestAccounts.
  //    Some Para/wagmi versions call wallet_requestPermissions first; others
  //    go straight to eth_requestAccounts. Authorize whichever arrives first
  //    within a short window, then wait for eth_requestAccounts.
  const permissionsCount = await new Promise<number>((resolve) => {
    const start = Date.now()
    const poll = () => {
      const count = wallet.getPendingRequestCount(Web3RequestKind.RequestPermissions)
      if (count >= 1 || Date.now() - start > 3_000) {
        resolve(count)
      } else {
        setTimeout(poll, 100)
      }
    }
    poll()
  })
  if (permissionsCount >= 1) {
    await wallet.authorize(Web3RequestKind.RequestPermissions)
  }

  await expect
    .poll(() => wallet.getPendingRequestCount(Web3RequestKind.RequestAccounts), {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(1)
  await wallet.authorize(Web3RequestKind.RequestAccounts)

  // Wait for the Connect button to disappear (wallet connected)
  await expect(connectButton).not.toBeVisible({ timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// Transaction helpers (re-exported for convenience)
// ---------------------------------------------------------------------------

export {
  authorizeTransaction,
  authorizeTransactions,
} from './portal-auth.js'
