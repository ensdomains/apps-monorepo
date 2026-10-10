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

import {
  type Web3ProviderBackend,
  Web3RequestKind,
} from '@ensdomains/headless-web3-provider'
import type { Locator, Page } from '@playwright/test'
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

/**
 * Open the name-selection step at /upgrade.
 *
 * Straight to the route, not through the dashboard's "Upgrade Names" banner:
 * the banner is onboarding and hides itself once the wallet has migrated any
 * name (`shouldShowUpgradeBanner`, `migratedCount >= 1`). Against a real index
 * the shared test wallet keeps every name it migrates, so after the first
 * migration the banner never shows again and every later test would stall on
 * it. Tests about the banner itself assert it on purpose.
 */
export async function openMigrationFlow(page: Page): Promise<void> {
  await page.goto(`${MANAGER_APP_URL}/upgrade`)
  await page
    .getByRole('heading', { name: /ready to upgrade/i })
    .waitFor({ state: 'visible', timeout: 60_000 })
}

/**
 * Untick every root. The selection seeds itself with every eligible name once
 * the eligibility reads finish, and anything toggled before that is
 * overwritten, so this waits for the Select/Deselect-all toggle (disabled
 * until then, and only rendered for more than one root) and uses it: with a
 * real index the shared wallet's list is long, and the list's own control is
 * exact and fast.
 */
async function clearSelection(page: Page, checkboxes: Locator): Promise<void> {
  const toggleAll = page.getByRole('button', {
    name: /^(Deselect|Select) all$/i,
  })
  const hasToggle = await toggleAll
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  if (!hasToggle) {
    for (const checkbox of await checkboxes.all()) {
      if (await checkbox.isChecked()) await checkbox.locator('xpath=..').click()
    }
    return
  }
  await expect(toggleAll).toBeEnabled({ timeout: 120_000 })
  if (/deselect/i.test(await toggleAll.innerText())) await toggleAll.click()
  await expect(
    page.getByRole('button', { name: /^Select all$/i }),
  ).toBeVisible()
}

/**
 * Leave exactly `roots` selected.
 *
 * Clears the selection, then ticks each wanted root. Toggling a root toggles
 * its whole subtree, and descendants have no checkbox, so only roots are ever
 * clicked. The input is visually hidden, so the click goes to its label.
 */
export async function selectOnlyRoots(
  page: Page,
  roots: readonly string[],
): Promise<void> {
  const wanted = new Set(roots)
  const checkboxes = page.getByRole('checkbox', { name: /\.eth$/ })

  await clearSelection(page, checkboxes)

  for (const name of roots) {
    const checkbox = rootRow(page, name)
    if (!(await checkbox.isChecked()))
      await checkbox.locator('xpath=..').click()
    await expect(checkbox, `expected ${name} to end up selected`).toBeChecked()
  }

  for (const checkbox of await checkboxes.all()) {
    const name = await checkbox.getAttribute('aria-label')
    if (name && !wanted.has(name))
      await expect(checkbox, `${name} must not stay selected`).not.toBeChecked()
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

/**
 * The plan the confirm screen promises: the "N requests" count and the step
 * titles in "What you'll approve", in order.
 */
export async function readPlan(
  page: Page,
): Promise<{ count: number; steps: string[] }> {
  const trigger = page.getByRole('button', { name: /^\d+ requests?$/ })
  await expect(trigger).toBeVisible({ timeout: 60_000 })
  const count = Number.parseInt(await trigger.innerText(), 10)
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: "What you'll approve" })
  await expect(dialog).toBeVisible()
  const steps = await dialog.locator('ol > li h3').allInnerTexts()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  console.log(`[migration] plan: ${count} requests — ${steps.join(' → ')}`)
  return { count, steps }
}

/**
 * Click "Upgrade N names" and authorize every wallet prompt until the success
 * screen, returning how many `eth_sendTransaction` prompts the wallet saw.
 */
export async function upgradeCountingPrompts(
  page: Page,
  wallet: Web3ProviderBackend,
): Promise<number> {
  const upgrade = page.getByRole('button', { name: /^Upgrade \d+ names?$/ })
  await expect(upgrade).toBeEnabled({ timeout: 60_000 })
  let done = false
  let prompts = 0
  const authorizeAll = (async () => {
    while (!done) {
      if (wallet.getPendingRequestCount(Web3RequestKind.SendTransaction) > 0) {
        await wallet.authorize(Web3RequestKind.SendTransaction)
        prompts++
        continue
      }
      await page.waitForTimeout(250).catch(() => {})
    }
  })()
  await upgrade.click()
  await expect(
    page.getByRole('heading', {
      name: /your names? (has|have) been upgraded/i,
    }),
  ).toBeVisible({ timeout: 180_000 })
  done = true
  await authorizeAll
  return prompts
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
