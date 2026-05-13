// e2e/projects/manager/tests/registration.spec.ts
// import { test, expect } from '@playwright/test'
import { privateKeyToAccount } from 'viem/accounts'
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import { fillParaOtpInput, clickParaSignInButton } from '../../../helpers/para-auth.js'
import { findSearchInput } from '../../../helpers/search-input.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PARA_EOA_ADDRESS = privateKeyToAccount(
  (process.env.ANVIL_PARA_PRIVATE_KEY ??
    '0x4d1cf5e322e2a7dbfc9e3eccde100ed93167879de7449d18872911ed3a957a81') as `0x${string}`,
).address
const PARA_EMAIL = process.env.PARA_E2E_EMAIL ?? 'test1@test.getpara.com'
const PARA_PIN = process.env.PARA_E2E_PIN ?? '123456'
const DOMAIN_TO_REGISTER = `e2e-${Date.now().toString(36)}.eth`
const DISCONNECTED_DOMAIN = `e2e-${(Date.now() + 1).toString(36)}.eth`
const LATE_AUTH_DOMAIN = `e2e-${(Date.now() + 2).toString(36)}.eth`

test.describe('ENS name registration', () => {
  test('registers a name via Para wallet and stablecoin payment', async ({
    authenticatedPage: page,
    mockIndexer,
  }) => {
    // ===== registration flow =====
    const nameOnly = DOMAIN_TO_REGISTER.replace(/\.eth$/i, '')
    const searchInput = await findSearchInput(page)
    await searchInput.click()
    await searchInput.fill(nameOnly)
    await page.getByText('Available').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByText(DOMAIN_TO_REGISTER).click()

    // const incrementButton =
    //   page.locator('button[aria-label="Increment"]').or(
    //     page.locator('button:has(svg.lucide-plus)'),
    //   )
    // await incrementButton.waitFor({ state: 'visible', timeout: 10_000 })
    // await incrementButton.click()

    await page
      .getByRole('button', { name: /pay with stablecoins/i })
      .click()
    await page.getByText('USDC', { exact: true }).click()

    await page
      .getByRole('button', { name: /buy name/i })
      .click()

    const successBanner = page.locator('p.text-ens-peridot-text-dark')
    await expect(successBanner).toContainText('Registration Complete', {
      timeout: 90_000,
    })

    if (mockIndexer.enabled) {
      mockIndexer.addName({ name: DOMAIN_TO_REGISTER, owner: PARA_EOA_ADDRESS })
    }

    await page.goto(
      mockIndexer.enabled ? MANAGER_APP_URL : `${MANAGER_APP_URL}/dashboard`,
    )
    await page.waitForLoadState('networkidle')

    const dashboardSearchInput = await findSearchInput(page)
    await dashboardSearchInput.click()
    await dashboardSearchInput.fill(nameOnly)
    await page.getByText(DOMAIN_TO_REGISTER).first().click()

    await page.waitForURL(
      new RegExp(`/${DOMAIN_TO_REGISTER.replace(/\./g, '\\.')}`),
      { timeout: 15_000 },
    )
    await expect(page.getByText(DOMAIN_TO_REGISTER).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('user is unable to register a name when disconnected', async ({ page }) => {
    await page.goto(MANAGER_APP_URL)

    const searchInput = page.getByPlaceholder('.eth')
    await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
    await searchInput.click()
    await searchInput.fill(DISCONNECTED_DOMAIN.replace(/\.eth$/i, ''))
    await page.getByText('Available').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByText(DISCONNECTED_DOMAIN).click()

    await page.waitForURL(/\/register\//, { timeout: 15_000 })
    await expect(
      page.getByRole('button', { name: /connect or sign in to register/i }),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('registers a name after connecting from the pricing page', async ({ page, mockIndexer }) => {
    await page.goto(MANAGER_APP_URL)

    const searchInput = page.getByPlaceholder('.eth')
    await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
    await searchInput.click()
    await searchInput.fill(LATE_AUTH_DOMAIN.replace(/\.eth$/i, ''))
    await page.getByText('Available').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByText(LATE_AUTH_DOMAIN).click()

    await page.waitForURL(/\/register\//, { timeout: 15_000 })
    await page.getByRole('button', { name: /connect or sign in to register/i }).click()

    // ===== Para auth flow =====
    const emailInput = page.locator('input[id="cpsl-input-0"]')
    await emailInput.waitFor({ state: 'visible', timeout: 15_000 })
    await emailInput.fill(PARA_EMAIL)
    await page.locator('cpsl-button[slot="end"]').last().click()

    await fillParaOtpInput(page, PARA_PIN)
    await clickParaSignInButton(page)

    // ===== registration flow =====
    const payButton = page.getByRole('button', { name: /pay with stablecoins/i })
    await payButton.waitFor({ state: 'visible', timeout: 15_000 })
    await payButton.click()
    await page.getByText('USDC', { exact: true }).click()
    await page.getByRole('button', { name: /buy name/i }).click()

    const successBanner = page.locator('p.text-ens-peridot-text-dark')
    await expect(successBanner).toContainText('Registration Complete', {
      timeout: 90_000,
    })

    if (mockIndexer.enabled) {
      mockIndexer.addName({ name: LATE_AUTH_DOMAIN, owner: PARA_EOA_ADDRESS })
    }

    await page.goto(
      mockIndexer.enabled ? MANAGER_APP_URL : `${MANAGER_APP_URL}/dashboard`,
    )
    await page.waitForLoadState('networkidle')

    const dashboardSearchInput = await findSearchInput(page)
    await dashboardSearchInput.click()
    await dashboardSearchInput.fill(LATE_AUTH_DOMAIN.replace(/\.eth$/i, ''))
    await page.getByText(LATE_AUTH_DOMAIN).first().click()

    await page.waitForURL(
      new RegExp(`/${LATE_AUTH_DOMAIN.replace(/\./g, '\\.')}`),
      { timeout: 15_000 },
    )
    await expect(page.getByText(LATE_AUTH_DOMAIN).first()).toBeVisible({
      timeout: 15_000,
    })
  })
})
