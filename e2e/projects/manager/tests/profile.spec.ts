import { expect } from '@playwright/test'
import { test, authorizeTransaction } from '../../../fixtures/playwright.manager.fixture.js'
import {
    ensureProfilePillField,
    goToEditProfile,
    goToProfile,
    renewFor28Days,
    saveProfileChanges,
    waitForProfileUpdated,
} from '../../../helpers/profile-helpers.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

test.describe('ENS profile', () => {
    test.describe.configure({ timeout: 300_000 })

    test('add lots of records to profile', async ({
        connectedPage: page,
        makeV2Name,
    }) => {
        test.skip(true, 'Blocked - WEB409')
        const name = await makeV2Name({ label: 'profileadd' })
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
        // In Rhinestone HCA mode profile-record saves are eth_signTypedData_v4 intents
        // that are auto-authorized by PERMITTED_SIGN_KINDS — no eth_sendTransaction.
        await waitForProfileUpdated(page)

        console.log(`[profile] ✅ Add lots of records succeeded for ${name}`)
    })

    test('remove records from profile', async ({
        connectedPage: page,
        makeV2Name,
    }) => {
        test.skip(true, 'Blocked - WEB409')
        const name = await makeV2Name({ label: 'profilerem' })
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
        connectedPage: page,
        makeV2Name,
    }) => {
        test.skip(true, 'Blocked - WEB409')
        const name = await makeV2Name({ label: 'profileval' })
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
        // Favorites require backend auth — the FavoriteButton's
        // `disabled` prop is bound to `useAtom(isBackendAuthed)` and
        // the API mutations call the deployed worker. Use the
        // sign-in fixture variant so the heart button is interactive.
        authenticatedPageWithBackend: page,
        makeV2Name,
    }) => {
        test.skip(process.env.E2E_MOCK_INDEXER === 'true', 'Requires real indexer (SSR bypasses Playwright mock)')
        // Register with a record so the profile view page renders
        // (empty profiles redirect to /edit where there's no heart button)
        const name = await makeV2Name({
            label: 'profilefav',
            records: [{ key: 'description', value: 'favourite name' }],
        })
        console.log(`[profile] name for favourites test: ${name}`)

        // Navigate to the view profile page
        await goToProfile(page, name)
        await page.waitForTimeout(3_000)

        // Add to favourites — register the response listener BEFORE the click so we
        // never miss a fast response. Accept any /favorites request (POST or DELETE)
        // so the test stays green on retries where the name may already be favourited.
        const heartButton = page.locator('button:has(.lucide-heart)').first()
        await heartButton.waitFor({ state: 'visible', timeout: 10_000 })

        // If already favourited from a previous retry, unfavourite first so the
        // dashboard assertion (name IN Favorites) is reliable.
        const isAlreadyFavourited = await page
            .locator('button:has(.lucide-heart) svg.lucide-heart')
            .first()
            .evaluate((el) => el.classList.contains('fill-[#f53293]'))
        if (isAlreadyFavourited) {
            const removePrior = page.waitForResponse(
                (resp) => resp.url().includes('/favorites') && resp.request().method() === 'DELETE',
                { timeout: 10_000 },
            )
            await heartButton.click()
            await removePrior
        }

        const addDone = page.waitForResponse(
            (resp) => resp.url().includes('/favorites') && resp.request().method() === 'PUT',
            { timeout: 10_000 },
        )
        await heartButton.click()
        await addDone

        // Verify name appears under the Favorites tab on the dashboard
        await page.goto(`${MANAGER_APP_URL}/dashboard`)
        await page.waitForLoadState('networkidle')
        await page.getByText('Favorites').click()
        await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 })

        // Remove from favourites — listener registered before click, then wait for it
        await goToProfile(page, name)
        await page.waitForTimeout(3_000)
        const unfavButton = page.locator('button:has(.lucide-heart)').first()
        await unfavButton.waitFor({ state: 'visible', timeout: 10_000 })

        const removeDone = page.waitForResponse(
            (resp) => resp.url().includes('/favorites') && resp.request().method() === 'DELETE',
            { timeout: 10_000 },
        )
        await unfavButton.click()
        await removeDone

        // Verify name is gone from the Favorites tab.
        await page.goto(`${MANAGER_APP_URL}/dashboard`)
        await page.waitForLoadState('networkidle')
        await page.getByText('Favorites').click()
        await page.waitForTimeout(2_000)
        await expect(page.getByText(name).first()).not.toBeVisible({ timeout: 10_000 })

        console.log(`[profile] ✅ Favourites add/remove succeeded for ${name}`)
    })

    test('can favourite a name not owned by the user', async ({
        // Same backend-auth requirement as the owned-name favorites
        // test above — see comment there.
        authenticatedPageWithBackend: page,
        makeV2Name,
    }) => {
        // Skip when indexer is mocked — page.goto('/dashboard') triggers SSR which
        // bypasses Playwright's route interceptor, causing the server to redirect to /.
        // The owned-name favourite test already covers the full favourite flow.
        test.skip(process.env.E2E_MOCK_INDEXER === 'true', 'Requires real indexer (SSR bypasses Playwright mock)')

        // Register a name owned by a different account so the authenticated
        // user can favourite it without being the owner.
        const name = await makeV2Name({
            label: 'otherfav',
            owner: 'other',
            records: [{ key: 'description', value: 'someone else\'s name' }],
        })
        console.log(`[profile] name for other-favourite test: ${name}`)

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

        // Remove from favourites — go back to the profile page and click the heart again
        await page.goto(`${MANAGER_APP_URL}/p/${name}`)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(3_000)
        const unfavButton = page.locator('button:has(.lucide-heart)').first()
        await unfavButton.waitFor({ state: 'visible', timeout: 10_000 })
        await unfavButton.click()
        await page.waitForTimeout(2_000)

        // Verify name is gone from the Favorites tab
        await page.goto(`${MANAGER_APP_URL}/dashboard`)
        await page.waitForLoadState('networkidle')
        await page.getByText('Favorites').click()
        await page.waitForTimeout(2_000)
        await expect(page.getByText(name)).not.toBeVisible({ timeout: 10_000 })

        console.log(`[profile] ✅ Favouriting a non-owned name succeeded for ${name}`)
    })

    test('extend owned name by 28 days', async ({
        connectedPage: page,
        makeV2Name,
        wallet,
    }) => {
        const name = await makeV2Name({ label: 'extendowned' })
        console.log(`[profile] name for extend-owned test: ${name}`)

        await goToProfile(page, name)
        await page.getByRole('link', { name: /extend name/i }).click()
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(2_000)

        // In Rhinestone mode: USDC approve is eth_sendTransaction (1 tx),
        // renew is a Rhinestone intent (auto-authorized). Catch timeout in
        // case allowance is already sufficient and the approve is skipped.
        const [expiry] = await Promise.all([
            renewFor28Days(page),
            authorizeTransaction(wallet, 240_000).catch(() => { }),
        ])
        console.log(`[profile] ✅ Extend owned name by 28 days succeeded for ${name}, expires ${expiry}`)
    })

    test('extend unowned name by 28 days', async ({
        connectedPage: page,
        makeV2Name,
        wallet,
    }) => {
        const name = await makeV2Name({ label: 'extendunowned', owner: 'other' })
        console.log(`[profile] name for extend-unowned test: ${name}`)

        await page.goto(`${MANAGER_APP_URL}/p/${name}`)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(3_000)

        await page.getByRole('link', { name: /extend name/i }).click()
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(2_000)

        // In Rhinestone mode: USDC approve is eth_sendTransaction (1 tx),
        // renew is a Rhinestone intent (auto-authorized). Catch timeout in
        // case allowance is already sufficient and the approve is skipped.
        const [expiry] = await Promise.all([
            renewFor28Days(page),
            authorizeTransaction(wallet, 240_000).catch(() => { }),
        ])
        console.log(`[profile] ✅ Extend unowned name by 28 days succeeded for ${name}, expires ${expiry}`)
    })
})
