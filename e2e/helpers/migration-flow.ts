/**
 * The migration flow, driven through the UI.
 *
 * This lived as three private copies — one in each of `migration.spec.ts`,
 * `migration-fuses.spec.ts` and `migration-premium.spec.ts` — and they had
 * drifted apart. Only `migration.spec.ts`'s copy matched the current UI; the
 * other two still waited on `"You're on ENS v2!"` and a `Done` button, and
 * looked for `Upgrade Names` on the confirm screen where the button now reads
 * `Upgrade N names`. Because those specs are excluded by the manager project's
 * `testIgnore`, nothing ever ran them and the drift went unnoticed.
 *
 * One copy, imported by all three.
 */

import type { Web3ProviderBackend } from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

// Imported from `manager-auth.js` rather than from the manager fixture that
// re-exports it: the fixture imports this directory, so going the other way
// would make helpers and fixtures mutually dependent.
import { authorizeTransactionsWhile } from './manager-auth.js'
import { findSearchInput } from './search-input.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

// ---------------------------------------------------------------------------
// Row locators
// ---------------------------------------------------------------------------

/**
 * A selectable (depth-0) row in the name tree: its checkbox.
 *
 * `NameRow` renders a depth-0 row as a `<label title={name}>` wrapping a
 * checkbox with `aria-label={name}`. It was a button with `aria-pressed` until
 * the bulk-selection rework (#1229); this locator followed it on 2026-10-08.
 */
export function rootRow(page: Page, fullName: string) {
  return page.getByRole('checkbox', { name: fullName, exact: true })
}

/**
 * A nested (descendant) row. These are deliberately NOT interactive: a subname
 * follows its root's selection and cannot be toggled on its own. So this
 * matches the `title` attribute rather than a role — and `rootRow(...)` having
 * a count of 0 for the same name is itself the oracle for "this name is a
 * passenger, not a choice".
 */
export function nestedRow(page: Page, fullName: string) {
  return page.getByTitle(fullName, { exact: true })
}

/** Any row, selectable or not. */
export function anyRow(page: Page, fullName: string) {
  return page.getByTitle(fullName, { exact: true })
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

/** Dashboard → "Upgrade Names" → the name-selection step. */
export async function openMigrationFlow(page: Page): Promise<void> {
  await page.goto(`${MANAGER_APP_URL}/dashboard`)
  await page.waitForLoadState('networkidle')

  const upgradeButton = page
    .getByRole('button', { name: 'Upgrade Names' })
    .first()
  await upgradeButton.waitFor({ state: 'visible', timeout: 30_000 })
  await upgradeButton.click()

  await page
    .getByRole('heading', { name: /ready to upgrade/i })
    .waitFor({ state: 'visible', timeout: 30_000 })
}

/**
 * Leave exactly `roots` selected.
 *
 * The selection seeds itself with every eligible name, and toggling a root
 * toggles its whole subtree, so this reads each root checkbox and clicks only
 * the ones that disagree. It never clicks a descendant — descendants have no
 * checkbox. The input is visually hidden, so the click goes to its label.
 */
export async function selectOnlyRoots(
  page: Page,
  roots: readonly string[],
): Promise<void> {
  const wanted = new Set(roots)
  const checkboxes = page.getByRole('checkbox', { name: /\.eth$/ })
  const count = await checkboxes.count()

  for (let i = 0; i < count; i++) {
    const checkbox = checkboxes.nth(i)
    const name = await checkbox.getAttribute('aria-label')
    if (!name) continue
    if (wanted.has(name) !== (await checkbox.isChecked())) {
      await checkbox.locator('xpath=..').click()
    }
  }

  for (const name of roots) {
    await expect(
      rootRow(page, name),
      `expected ${name} to end up selected`,
    ).toBeChecked()
  }
}

/**
 * Confirm the upgrade and authorize every wallet prompt until the success
 * screen appears.
 *
 * The confirm screen names how many wallet confirmations to expect (e.g.
 * "Expected: 2 wallet confirmations") — the migration batch is often more
 * than one sequential eth_sendTransaction, and a copy batch is longer still
 * (resolver deployment, co-admin grant, three UserRegistry setup calls, the
 * migrate call, copy-register, then profile replay). Poll and authorize
 * whatever arrives until the success screen shows, rather than authorizing a
 * single fixed count.
 */
export async function confirmAndAuthorize(
  page: Page,
  wallet: Web3ProviderBackend,
): Promise<void> {
  const confirmButton = page.getByRole('button', {
    name: /^Upgrade \d+ names?$/,
  })
  await confirmButton.waitFor({ state: 'visible', timeout: 30_000 })

  let migrationComplete = false
  const authorizeAll = authorizeTransactionsWhile(
    page,
    wallet,
    () => migrationComplete,
  )
  await confirmButton.click()

  const successIndicator = page.getByRole('heading', {
    name: /your names? (has|have) been upgraded/i,
  })
  await successIndicator.waitFor({ state: 'visible', timeout: 120_000 })
  migrationComplete = true
  await authorizeAll

  const doneButton = page.getByRole('button', { name: 'Go to dashboard' })
  await doneButton.waitFor({ state: 'visible', timeout: 10_000 })
  await doneButton.click()
}

/**
 * The whole flow: dashboard → Upgrade → confirm → authorize → success.
 * Pass `roots` to narrow the selection before confirming.
 */
export async function runMigrationFlow(
  page: Page,
  wallet: Web3ProviderBackend,
  options: { readonly roots?: readonly string[] } = {},
): Promise<void> {
  await openMigrationFlow(page)
  if (options.roots) await selectOnlyRoots(page, options.roots)
  await confirmAndAuthorize(page, wallet)
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Search for a name using the search bar and navigate to its profile. */
export async function searchAndNavigateToProfile(
  page: Page,
  name: string,
): Promise<void> {
  const nameOnly = name.replace(/\.eth$/i, '')
  const searchInput = await findSearchInput(page)
  await searchInput.click()
  await searchInput.fill(nameOnly)
  // Click the matching suggestion in the dropdown
  await page.getByText(name).first().click()
  // Wait for the profile page to load. `waitForURL` was observed hanging to
  // its full timeout even once the profile heading was already visible and
  // correct in a screenshot taken at the moment of "failure" — this app's
  // client-side router doesn't reliably produce whatever navigation signal
  // `waitForURL` waits on. Assert on the rendered heading instead, which is
  // both the actual oracle this helper cares about and doesn't depend on
  // how the route change is implemented.
  await page
    .getByRole('heading', { name, level: 1 })
    .waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForLoadState('networkidle')
}

/** Navigate directly to a name's profile page. */
export async function goToProfile(page: Page, name: string): Promise<void> {
  await page.goto(`${MANAGER_APP_URL}/p/${name}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2_000)
}
