import type { Page } from '@playwright/test'
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import {
  clickThroughEnableSessions,
  fixRawHashPersonalSign,
} from '../../../helpers/manager-auth.js'
import { findSearchInput } from '../../../helpers/search-input.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

async function viewProfile(page: Page, name: string) {
  // Navigate directly to the profile page — avoids search dropdown
  // flakiness caused by React re-renders detaching DOM elements in CI.
  // The app may redirect owned names to /p/{name}/edit, so accept both.
  const escapedName = name.replace(/\./g, '\\.')
  await page.goto(`${MANAGER_APP_URL}/p/${name}`)
  await page.waitForURL(new RegExp(`/p/${escapedName}(/edit)?$`), { timeout: 15_000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2_000)

  const viewProfileLink = page.getByText('View profile')
  const editProfileLink = page.getByText('Edit Profile')
  if (await viewProfileLink.isVisible({ timeout: 15_000 })) {
    await viewProfileLink.click()
  }
  if (await editProfileLink.isVisible({ timeout: 15_000 })) {
    await editProfileLink.click()
  }
}

// Must run before any other spec registers a name to the shared connected
// account (single worker, same Anvil fork across files — see
// e2e/playwright.config.base.ts). The auto-primary-name feature only
// triggers when the wallet owns fewer than 2 names and has no primary name
// set yet, which only holds true this early in the suite.
test.describe('ENS primary name (post-registration auto-setup)', () => {
  test.describe.configure({ timeout: 300_000 })

  test('sets the newly registered name as primary after a successful registration', async ({
    connectedPage: page,
    mockIndexer,
    accounts,
    wallet,
  }) => {
    // Work around a headless-web3-provider bug that breaks raw-hash
    // personal_sign requests (used by the primary-name authorization) —
    // see fixRawHashPersonalSign for the full root-cause explanation.
    fixRawHashPersonalSign(wallet, accounts.getPrivateKey('user'))

    const domainToRegister = `e2e-primary-${Date.now().toString(36)}.eth`
    const nameOnly = domainToRegister.replace(/\.eth$/i, '')

    const searchInput = await findSearchInput(page)
    await searchInput.click()
    await searchInput.fill(nameOnly)
    await page.getByText('Available').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByText(domainToRegister).click()

    await page.getByRole('button', { name: /pay with stablecoins/i }).click()
    // Smart-session gate: on the HCA path clicking "Pay with stablecoins" opens
    // the EnableSessions modal before the token picker. Idempotent no-op in
    // EOA mode. See registration-rhinestone.spec.ts.
    await clickThroughEnableSessions(page)
    await page.getByText('USDC', { exact: true }).click()
    await page.getByRole('button', { name: /register name/i }).click()

    // RegisteringStep renders NotificationSettings for as long as the
    // parallel `notifications` region sits in its initial `settings` state —
    // checked BEFORE transaction state in the component's match(), so
    // RegistrationDetails (and "Complete your profile" below) never renders
    // until this is dismissed. connectedPage skips the BackendAuth/SIWE
    // modal, so the unauthenticated ("Verify Wallet") variant renders here.
    await page.getByRole('button', { name: 'Set up later' }).click()

    const successBanner = page.locator('p.text-ens-peridot-text-dark')
    await expect(successBanner).toContainText('Registration Complete', {
      timeout: 240_000,
    })

    // The banner above can render as soon as the underlying mint transaction
    // succeeds (useRegistrationFillProgress ORs in the child registration
    // actor's own `success`), which is BEFORE the post-registration
    // primary-name signature flow (a further parallel step in
    // registrationUi.machine.ts: postRegistrationDecision ->
    // settingPrimaryName* -> waitingForPrimaryName* -> success) has actually
    // finished. Navigating away here would tear down the SPA and kill that
    // in-flight step. "Complete your profile" only appears once
    // `registering.transaction` itself reaches `success` (see
    // RegistrationDetails.tsx's useIsRegisteringTransactionSuccess), which is
    // the real signal that primary-name setup (if eligible) has completed.
    await expect(
      page.getByRole('link', { name: /complete your profile/i }),
    ).toBeVisible({ timeout: 60_000 })

    if (mockIndexer.enabled) {
      mockIndexer.addName({ name: domainToRegister, owner: accounts.getAddress('user') })
    }

    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByText('Primary Name', { exact: true }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(domainToRegister)).toBeVisible({ timeout: 15_000 })
  })
})

test.describe.skip('ENS primary name', () => {
  test.describe.configure({ timeout: 300_000 })

  test('Set primary name', async ({ connectedPage: page, makeV2Name }) => {
    const name = await makeV2Name({ label: 'primetest' })
    console.log(`[primaryName] name for set-primary test: ${name}`)

    await viewProfile(page, name)

    await page.getByRole('button', { name: /set primary name/i }).click()
    // In Rhinestone HCA mode both steps (set ETH address record + set primary
    // name) are eth_signTypedData_v4 intents, auto-authorized via
    // PERMITTED_SIGN_KINDS. Wait for the success navigation that
    // usePrimaryNameSuccessRedirect triggers instead of authorizing txs.
    await page.getByRole('button', { name: /set as primary/i }).click()
    const escapedName = name.replaceAll('.', String.raw`\.`)
    await page.waitForURL(new RegExp(`/${escapedName}$`), { timeout: 120_000 })

    await page.goto(`${MANAGER_APP_URL}/p/${name}/edit`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2_000)

    // Set up listener BEFORE triggering the action to avoid missing the event
    const txDone = page.waitForEvent('console', {
      predicate: (msg) => msg.text().includes('[SAVE_RECORDS] Transaction completed:'),
      timeout: 90_000,
    })

    await page.getByRole('button', { name: 'Remove Ethereum' }).click()
    await page.getByText('Save Changes').click()
    await page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /save changes/i })
      .click()
    // In Rhinestone mode: profile record saves are eth_signTypedData_v4 intents,
    // auto-authorized. txDone waits for the [SAVE_RECORDS] console log.
    await txDone

    await expect(page.getByText('Profile updated')).toBeVisible({ timeout: 10_000 })

  })
})
