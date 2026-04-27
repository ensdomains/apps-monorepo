/**
 * ENS V1 → V2 Migration E2E Tests
 *
 * Tests the migration flow for V1 .eth names of different types:
 * - Unwrapped: ERC-721 on BaseRegistrar (no NameWrapper)
 * - Wrapped (unlocked): NameWrapper ERC-1155 without CANNOT_UNWRAP fuse
 * - Locked: NameWrapper ERC-1155 with CANNOT_UNWRAP fuse
 * - Batch: multiple names migrated in a single flow
 * - V1 records preservation: records set on V1 survive migration
 * - Post-migration profile editing
 *
 * Each test:
 * 1. Registers one or more V1 names on the Anvil fork
 * 2. Authenticates with Para wallet
 * 3. Mocks the V1 subgraph to inject the test names
 * 4. Triggers the migration flow through the UI
 * 5. Verifies the migration completes successfully
 * 6. Verifies the migrated name is accessible on the profile page
 *
 * Prerequisites:
 *   - Anvil fork running with V1 + V2 contracts
 *   - Manager app running with Rhinestone enabled
 */
import { test, expect } from '../../../fixtures/playwright.manager.fixture.js'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import { mockV1Subgraph, type MockV1Name } from '../../../helpers/mock-v1-subgraph.js'
import { findSearchInput } from '../../../helpers/search-input.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

// Para test EOA — must match the key in makeV1Name.ts
const PARA_EOA = '0xc9eec1b174a646d7c282820afe94acfba6c00a12'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Shared migration flow: navigate to dashboard → click Upgrade → confirm → wait for success.
 */
async function runMigrationFlow(page: import('@playwright/test').Page) {
  await page.goto(`${MANAGER_APP_URL}/dashboard`)
  await page.waitForLoadState('networkidle')

  const upgradeButton = page
    .getByRole('button', { name: 'Upgrade Names' })
    .first()
  await upgradeButton.waitFor({ state: 'visible', timeout: 10_000 })
  await upgradeButton.click()

  await page.waitForTimeout(2_000)

  const confirmButton = page.getByRole('button', { name: 'Upgrade Names' })
  await confirmButton.waitFor({ state: 'visible', timeout: 10_000 })
  await confirmButton.click()

  const successIndicator = page.getByText("You're on ENS v2!")
  await successIndicator.waitFor({ state: 'visible', timeout: 10_000 })

  const doneButton = page.getByRole('button', { name: 'Done' })
  await doneButton.waitFor({ state: 'visible', timeout: 10_000 })
  await doneButton.click()
}

/**
 * Search for a name using the search bar and navigate to its profile.
 */
async function searchAndNavigateToProfile(
  page: import('@playwright/test').Page,
  name: string,
) {
  const nameOnly = name.replace(/\.eth$/i, '')
  const searchInput = await findSearchInput(page)
  await searchInput.click()
  await searchInput.fill(nameOnly)
  // Click the matching suggestion in the dropdown
  await page.getByText(name).first().click()
  // Wait for the profile page to load
  await page.waitForURL(new RegExp(`/p/${name.replace('.', '\\.')}`), {
    timeout: 15_000,
  })
  await page.waitForLoadState('networkidle')
}

/**
 * Navigate directly to a name's profile page.
 */
async function goToProfile(
  page: import('@playwright/test').Page,
  name: string,
) {
  await page.goto(`${MANAGER_APP_URL}/p/${name}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2_000)
}

/**
 * Migrated names with no text records use `base: {}` — Bio/Website fields are not mounted until
 * their pills are used to add them (see BioSection + AddTextRecordsPills).
 */
async function ensureProfilePillField(
  page: import('@playwright/test').Page,
  options: { pillName: RegExp; fieldLabel: string | RegExp },
) {
  const field = page.getByLabel(options.fieldLabel)
  if ((await field.count()) === 0) {
    await page.getByRole('button', { name: options.pillName }).click()
  }
  await expect(field).toBeVisible({ timeout: 10_000 })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('ENS V1 → V2 Migration', () => {
  test.describe.configure({ timeout: 300_000 })

  test('migrate an unwrapped V1 name and view profile', async ({
    authenticatedPage: page,
  }) => {
    const makeV1Name = createMakeV1Name()
    const v1Name = await makeV1Name({ label: 'migtest' })
    console.log(`[migration] unwrapped V1 name created: ${v1Name}`)

    await mockV1Subgraph(page, [
      { name: v1Name, ownerAddress: PARA_EOA },
    ])

    await runMigrationFlow(page)

    // ── Post-migration: search for the name and go to profile ────
    await searchAndNavigateToProfile(page, v1Name)
    await expect(page.getByText(v1Name).first()).toBeVisible({ timeout: 10_000 })
    console.log(`[migration] ✅ Unwrapped migration + profile verified for ${v1Name}`)
  })

  test('migrate a wrapped (unlocked) V1 name to V2', async ({
    authenticatedPage: page,
  }) => {
    const makeV1Name = createMakeV1Name()
    const v1Name = await makeV1Name({ label: 'migwrap', type: 'wrapped' })
    console.log(`[migration] wrapped V1 name created: ${v1Name}`)

    await mockV1Subgraph(page, [
      { name: v1Name, ownerAddress: PARA_EOA, type: 'wrapped' },
    ])

    await runMigrationFlow(page)
    console.log(`[migration] ✅ Wrapped migration completed for ${v1Name}`)
  })

  test('migrate a locked V1 name to V2', async ({
    authenticatedPage: page,
  }) => {
    const makeV1Name = createMakeV1Name()
    const v1Name = await makeV1Name({ label: 'miglock', type: 'locked' })
    console.log(`[migration] locked V1 name created: ${v1Name}`)

    await mockV1Subgraph(page, [
      { name: v1Name, ownerAddress: PARA_EOA, type: 'locked' },
    ])

    await runMigrationFlow(page)
    console.log(`[migration] ✅ Locked migration completed for ${v1Name}`)
  })

  test('batch migrate multiple V1 names to V2', async ({
    authenticatedPage: page,
  }) => {
    const makeV1Name = createMakeV1Name()

    const unwrappedName = await makeV1Name({ label: 'migbatch-u' })
    const wrappedName = await makeV1Name({ label: 'migbatch-w', type: 'wrapped' })
    const lockedName = await makeV1Name({ label: 'migbatch-l', type: 'locked' })
    console.log(
      `[migration] batch names created: ${unwrappedName}, ${wrappedName}, ${lockedName}`,
    )

    const mockNames: MockV1Name[] = [
      { name: unwrappedName, ownerAddress: PARA_EOA },
      { name: wrappedName, ownerAddress: PARA_EOA, type: 'wrapped' },
      { name: lockedName, ownerAddress: PARA_EOA, type: 'locked' },
    ]
    await mockV1Subgraph(page, mockNames)

    await runMigrationFlow(page)
    console.log(
      `[migration] ✅ Batch migration completed for ${mockNames.length} names`,
    )
  })

  test('V1 records are preserved after migration', async ({
    authenticatedPage: page,
  }) => {
    const makeV1Name = createMakeV1Name()
    const testRecords = {
      texts: [
        { key: 'description', value: 'Migrated from V1 with records' },
        { key: 'url', value: 'https://example.com/v1-migrated' },
      ],
    }

    // Register a V1 name WITH records set on the V1 resolver
    const v1Name = await makeV1Name({
      label: 'migrec',
      records: testRecords,
    })
    console.log(`[migration] V1 name with records created: ${v1Name}`)

    await mockV1Subgraph(page, [
      {
        name: v1Name,
        ownerAddress: PARA_EOA,
        records: testRecords,
      },
    ])

    await runMigrationFlow(page)

    // ── Navigate to the migrated name's profile and verify records ───
    await goToProfile(page, v1Name)

    // The description should appear in the Bio section
    await expect(
      page.getByText('Migrated from V1 with records'),
    ).toBeVisible({ timeout: 15_000 })

    // The URL should appear in the Bio section
    await expect(
      page.getByText('https://example.com/v1-migrated'),
    ).toBeVisible({ timeout: 10_000 })

    console.log(`[migration] ✅ V1 records preserved after migration for ${v1Name}`)
  })

  test('can edit profile after migration', async ({
    authenticatedPage: page,
  }) => {
    const makeV1Name = createMakeV1Name()
    const v1Name = await makeV1Name({ label: 'migedit' })
    console.log(`[migration] V1 name for edit test created: ${v1Name}`)

    await mockV1Subgraph(page, [
      { name: v1Name, ownerAddress: PARA_EOA },
    ])

    await runMigrationFlow(page)

    // ── Navigate to the edit profile page ───────────────────────────
    await page.goto(`${MANAGER_APP_URL}/p/${v1Name}/edit`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3_000)

    // Bio card (CardTitle is a div, not a semantic heading)
    await expect(
      page.getByText('Add a bio to your profile', { exact: true }),
    ).toBeVisible({ timeout: 15_000 })

    // Bio: empty `base` means pills only — add Bio, then use label (placeholder is often invisible until focus)
    await ensureProfilePillField(page, {
      pillName: /^Bio\b/,
      fieldLabel: 'Short Description',
    })
    await page
      .getByLabel('Short Description')
      .fill('Post-migration profile edit test')

    await ensureProfilePillField(page, {
      pillName: /^Website\b/,
      fieldLabel: 'Website',
    })
    await page
      .getByLabel('Website')
      .fill('https://post-migration.example.com')

    // Contact + social: add one record each (arrays — only add if not already on the form)
    if ((await page.getByLabel('Email Address').count()) === 0) {
      await page.getByRole('button', { name: 'Email Address' }).click()
    }
    await page.getByLabel('Email Address').fill('post-migration@example.com')

    if ((await page.getByLabel('GitHub').count()) === 0) {
      await page.getByRole('button', { name: 'GitHub' }).click()
    }
    await page.getByLabel('GitHub').fill('ens-test-user')

    // Custom link: Radix dialog (md+) or vaul drawer — same fields in both
    await page.getByRole('button', { name: 'Add Link' }).click()
    const addLinkPanel = page.locator(
      '[data-slot="dialog-content"], [data-slot="drawer-content"]',
    )
    await addLinkPanel.waitFor({ state: 'visible', timeout: 10_000 })
    await addLinkPanel.getByLabel('Name', { exact: true }).fill('Test Link')
    await addLinkPanel
      .getByLabel('Link', { exact: true })
      .fill('https://link.example.com/path')
    await addLinkPanel.getByRole('button', { name: 'Add', exact: true }).click()

    // Click Save Changes
    await page.getByText('Save Changes').click()

    // Confirm in the diff dialog
    const saveButton = page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /save changes/i })
    await saveButton.waitFor({ state: 'visible', timeout: 10_000 })
    await saveButton.click()

    // Wait for the transaction to complete
    await expect(
      page.getByText('Profile updated'),
    ).toBeVisible({ timeout: 90_000 })

    console.log(`[migration] ✅ Profile edit after migration succeeded for ${v1Name}`)
  })
})
