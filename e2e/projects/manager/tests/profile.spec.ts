import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const NAME_TO_VIEW = 'test020.eth'

test.describe('ENS name profile', () => {
    test('disconnected profile viewing', async ({ page }) => {
        await page.goto(MANAGER_APP_URL)

        const searchInput = page.getByPlaceholder('.eth')
        await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
        await searchInput.click()
        await searchInput.fill(NAME_TO_VIEW.replace(/\.eth$/i, ''))
        await page.getByText(NAME_TO_VIEW).click()

        await page.waitForURL(new RegExp(`/p/${NAME_TO_VIEW}$`), { timeout: 15_000 })

        await expect(page.getByText(NAME_TO_VIEW).first()).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText('Edit Profile')).not.toBeVisible()
    })

    test('connected profile viewing', async ({ authenticatedPage: page }) => {
        const searchInput = page.getByPlaceholder('Search name, address...').first()
        await searchInput.waitFor({ state: 'visible', timeout: 15_000 })
        await searchInput.click()
        await searchInput.fill(NAME_TO_VIEW)
        await page
            .locator('[data-radix-popper-content-wrapper]')
            .getByRole('link', { name: new RegExp(NAME_TO_VIEW) })
            .click()

        await page.waitForURL(new RegExp(`/p/${NAME_TO_VIEW}/edit$`), { timeout: 15_000 })

        await expect(page.getByText(NAME_TO_VIEW).first()).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText('Add a bio to your profile')).toBeVisible({ timeout: 10_000 })
    })
})
