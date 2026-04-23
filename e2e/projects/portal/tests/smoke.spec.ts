import { test, expect } from '../../../fixtures/playwright.portal.fixture.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

test.describe('Portal smoke tests', () => {
  test('homepage loads and shows search input', async ({ portalPage: page }) => {
    await expect(page.getByText('ENS Explorer').first()).toBeVisible({ timeout: 15_000 })
    const searchInput = page.getByPlaceholder('Search name or address...')
    await expect(searchInput).toBeVisible()
  })

  test('can search for an ENS name and see suggestions', async ({
    portalPage: page,
  }) => {
    const searchInput = page.getByPlaceholder('Search name or address...')
    await searchInput.click()
    await searchInput.fill('ens2')

    // Wait for search results to appear in the dropdown
    await expect(
      page.getByText('ens2.eth').first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('can navigate to a name profile page', async ({
    portalPage: page,
  }) => {
    // Navigate directly to a known name
    await page.goto(`${PORTAL_APP_URL}/ens2.eth`)

    // The profile page should load with the name visible
    await expect(page.getByText('ens2.eth').first()).toBeVisible({
      timeout: 30_000,
    })
  })
})
