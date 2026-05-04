import { expect } from '@playwright/test'
import { test } from '../../../fixtures/playwright.manager.fixture.js'
import {
    ensureProfilePillField,
    goToEditProfile,
    goToProfile,
    saveProfileChanges,
    waitForProfileUpdated,
} from '../../../helpers/profile-helpers.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

test.describe('ENS profile', () => {
    test.describe.configure({ timeout: 300_000 })

    test('add lots of records to profile', async ({
        authenticatedPage: page,
        registerName,
    }) => {
        const name = await registerName('profileadd')
        console.log(`[profile] name for add-records test: ${name}`)

        await goToEditProfile(page, name)

        // Bio
        await ensureProfilePillField(page, {
            pillName: /^Bio\b/,
            fieldLabel: 'Short Description',
        })
        await page.getByLabel('Short Description').fill('This is a test bio')

        // Website
        await ensureProfilePillField(page, {
            pillName: /^Website\b/,
            fieldLabel: 'Website',
        })
        await page.getByLabel('Website').fill('https://example.com')

        // Email
        if ((await page.getByLabel('Email Address').count()) === 0) {
            await page.getByRole('button', { name: 'Email Address' }).click()
        }
        await page.getByLabel('Email Address').fill('test@example.com')

        // GitHub
        if ((await page.getByLabel('GitHub').count()) === 0) {
            await page.getByRole('button', { name: 'GitHub' }).click()
        }
        await page.getByLabel('GitHub').fill('ens-test-user')

        // X (Twitter)
        if ((await page.getByLabel('X (Twitter)').count()) === 0) {
            await page.getByRole('button', { name: 'X (Twitter)' }).click()
        }
        await page.getByLabel('X (Twitter)').fill('ens_test_user')

        // Custom link
        await page.getByRole('button', { name: 'Add Link' }).click()
        const addLinkPanel = page.locator(
            '[data-slot="dialog-content"], [data-slot="drawer-content"]',
        )
        await addLinkPanel.waitFor({ state: 'visible', timeout: 10_000 })
        await addLinkPanel.getByLabel('Name', { exact: true }).fill('Test Link')
        await addLinkPanel
            .getByLabel('Link', { exact: true })
            .fill('https://link.example.com')
        await addLinkPanel.getByRole('button', { name: 'Add', exact: true }).click()

        await saveProfileChanges(page)
        await waitForProfileUpdated(page)

        console.log(`[profile] ✅ Add lots of records succeeded for ${name}`)
    })

    test('remove records from profile', async ({
        authenticatedPage: page,
        registerName,
    }) => {
        const name = await registerName('profilerem')
        console.log(`[profile] name for remove-records test: ${name}`)

        // First pass — add two records and save
        await goToEditProfile(page, name)

        await ensureProfilePillField(page, {
            pillName: /^Bio\b/,
            fieldLabel: 'Short Description',
        })
        await page.getByLabel('Short Description').fill('Bio to be removed')

        if ((await page.getByLabel('Email Address').count()) === 0) {
            await page.getByRole('button', { name: 'Email Address' }).click()
        }
        await page.getByLabel('Email Address').fill('remove@example.com')

        await saveProfileChanges(page)
        await waitForProfileUpdated(page)

        // Navigate to view profile, wait for it to settle, then go into edit
        await goToProfile(page, name)
        await page.waitForTimeout(5_000)
        await page.getByText('Edit Profile').click()
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(3_000)

        // Both fields are removed by clicking their active pills
        await page.getByRole('button', { name: /^Bio\b/ }).click()
        await page.getByRole('button', { name: /^Email Address\b/ }).click()

        await saveProfileChanges(page)
        await waitForProfileUpdated(page)

        // Verify they are gone on the view profile page
        await goToProfile(page, name)
        await expect(page.getByText('Bio to be removed')).not.toBeVisible()
        await expect(page.getByText('remove@example.com')).not.toBeVisible()

        console.log(`[profile] ✅ Remove records succeeded for ${name}`)
    })

    test('shows validation errors for invalid records', async ({
        authenticatedPage: page,
        registerName,
    }) => {
        const name = await registerName('profileval')
        console.log(`[profile] name for validation-error test: ${name}`)

        await goToEditProfile(page, name)

        // Invalid website URL — fill then blur to trigger inline validation
        if ((await page.getByLabel('Website').count()) === 0) {
            await page.getByRole('button', { name: /^Website\b/ }).click()
        }
        await page.getByLabel('Website').fill('not-a-url')
        await page.getByLabel('Website').blur()

        // Invalid email — fill then blur to trigger inline validation
        if ((await page.getByLabel('Email Address').count()) === 0) {
            await page.getByRole('button', { name: /^Email Address\b/ }).click()
        }
        await page.getByLabel('Email Address').fill('not-an-email')
        await page.getByLabel('Email Address').blur()

        // Errors appear inline beneath the fields without needing to save
        await expect(
            page.getByText('Enter a valid URL (e.g. https://example.com)'),
        ).toBeVisible({ timeout: 10_000 })
        await expect(
            page.getByText('Enter a valid email address'),
        ).toBeVisible({ timeout: 10_000 })

        console.log(`[profile] ✅ Validation errors correctly shown for ${name}`)
    })

    test('add and remove name from favourites', async ({
        authenticatedPage: page,
        registerName,
    }) => {
        const name = await registerName('profilefav')
        console.log(`[profile] name for favourites test: ${name}`)

        // Add a bio so the profile has content, then navigate to the view page
        await goToEditProfile(page, name)
        await ensureProfilePillField(page, {
            pillName: /^Bio\b/,
            fieldLabel: 'Short Description',
        })
        await page.getByLabel('Short Description').fill('favourite name')
        await saveProfileChanges(page)
        await waitForProfileUpdated(page)
        await page.getByText('Go to profile').click()
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(2_000)

        // Add to favourites — heart button is in the top-right of the profile card
        const heartButton = page.locator('button:has(.lucide-heart)').first()
        await heartButton.waitFor({ state: 'visible', timeout: 10_000 })
        await heartButton.click()
        await page.waitForTimeout(2_000)

        // Verify name appears under the Favorites tab on the dashboard
        await page.goto(`${MANAGER_APP_URL}/dashboard`)
        await page.waitForLoadState('networkidle')
        await page.getByText('Favorites').click()
        await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 })

        // Remove from favourites — click the heart next to the name in the list
        await page.locator('button:has(.lucide-heart)').first().click()
        await expect(page.getByText('No names to display')).toBeVisible({
            timeout: 10_000,
        })

        console.log(`[profile] ✅ Favourites add/remove succeeded for ${name}`)
    })

    test('can favourite a name not owned by the user', async ({
        authenticatedPage: page,
    }) => {
        const name = 'tester-other.eth'

        // Navigate directly — avoids search dropdown flakiness (see primaryName.spec.ts)
        await page.goto(`${MANAGER_APP_URL}/p/${name}`)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(3_000)

        // Favourite it
        const heartButton = page.locator('button:has(.lucide-heart)').first()
        await heartButton.waitFor({ state: 'visible', timeout: 10_000 })
        await heartButton.click()
        await page.waitForTimeout(2_000)

        // Verify it appears in the Favorites tab on the dashboard
        await page.goto(`${MANAGER_APP_URL}/dashboard`)
        await page.waitForLoadState('networkidle')
        await page.getByText('Favorites').click()
        await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 })

        // Remove from favourites and verify it's gone
        await page.locator('button:has(.lucide-heart)').first().click()
        await expect(page.getByText('No names to display')).toBeVisible({
            timeout: 10_000,
        })

        console.log(`[profile] ✅ Favouriting a non-owned name succeeded for ${name}`)
    })
})
