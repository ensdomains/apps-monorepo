import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { permissionedRegistryGetExpirySnippet } from '@ensdomains/ensjs-abi/v2'
import type { Web3ProviderBackend } from '@ensdomains/headless-web3-provider'
import { expect, type Page } from '@playwright/test'
import { keccak256, toHex } from 'viem'
import type { V2NameConfig } from '../../../fixtures/makeV2Name.js'
import {
  authorizeTransaction,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  goToEditProfile,
  goToProfile,
  renewFor28Days,
  saveProfileChanges,
  waitForProfileUpdated,
} from '../../../helpers/profile-helpers.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const ETH_REGISTRY =
  ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address

/** On-chain expiry (seconds) for a 2LD `label`, per the current V2 registry. */
function readExpiry(label: string): Promise<bigint> {
  return publicClient.readContract({
    address: ETH_REGISTRY,
    abi: permissionedRegistryGetExpirySnippet,
    functionName: 'getExpiry',
    args: [BigInt(keccak256(toHex(label)))],
  })
}

test.describe('ENS profile', () => {
  test.describe.configure({ timeout: 300_000 })

  test('add lots of records to profile', async ({
    profileConnectedPage: page,
    makeV2Name,
    wallet,
  }) => {
    const name = await makeV2Name({ label: 'profileadd' })
    console.log(`[profile] name for add-records test: ${name}`)

    await goToEditProfile(page, name)

    // --- General tab (default) ---
    // Description and Custom link are visible by default; fill them directly.
    await page.getByPlaceholder('Description').fill('This is a test bio')
    await page
      .getByPlaceholder('https://yourwebsite.com')
      .fill('https://example.com')

    // --- Contact tab ---
    await page.getByRole('tab', { name: 'Contact' }).click()

    // E-mail is not enabled by default — toggle its pill first.
    await page
      .getByRole('button', { name: 'E-mail' })
      .and(page.locator(':not([aria-pressed])'))
      .click()
    await page.getByLabel('E-mail', { exact: true }).fill('test@example.com')

    // GitHub is not enabled by default — toggle its pill first.
    await page
      .getByRole('button', { name: 'GitHub' })
      .and(page.locator(':not([aria-pressed])'))
      .click()
    await page.getByLabel('GitHub', { exact: true }).fill('ens-test-user')

    // Twitter is enabled by default — fill the already-visible input.
    await page.getByLabel('Twitter', { exact: true }).fill('ens_test_user')

    // In-place record writes are always a plain eth_sendTransaction from the
    // owner EOA, even in Rhinestone HCA mode — saveProfileChanges authorizes it.
    await saveProfileChanges(page, wallet)
    await waitForProfileUpdated(page)

    console.log(`[profile] ✅ Add lots of records succeeded for ${name}`)
  })

  test('remove records from profile', async ({
    profileConnectedPage: page,
    makeV2Name,
    wallet,
  }) => {
    const name = await makeV2Name({ label: 'profilerem' })
    console.log(`[profile] name for remove-records test: ${name}`)

    // First pass — add a description and an e-mail record
    await goToEditProfile(page, name)

    // General tab: Description is visible by default.
    await page.getByPlaceholder('Description').fill('Bio to be removed')

    // Contact tab: E-mail is not enabled by default — toggle its pill first.
    await page.getByRole('tab', { name: 'Contact' }).click()
    await page
      .getByRole('button', { name: 'E-mail' })
      .and(page.locator(':not([aria-pressed])'))
      .click()
    await page.getByLabel('E-mail', { exact: true }).fill('remove@example.com')

    await saveProfileChanges(page, wallet)
    await waitForProfileUpdated(page)

    // Second pass — remove both records by clicking their active pills
    await goToEditProfile(page, name)

    // General tab: clicking the active "Description" pill clears its value.
    await page.getByRole('button', { name: 'Description' }).click()

    // Contact tab: clicking the active "E-mail" pill removes the record.
    await page.getByRole('tab', { name: 'Contact' }).click()
    await page
      .getByRole('button', { name: 'E-mail' })
      .and(page.locator(':not([aria-pressed])'))
      .click()

    await saveProfileChanges(page, wallet)
    await waitForProfileUpdated(page)

    // Verify they are gone on the view profile page
    await goToProfile(page, name)
    await expect(page.getByText('Bio to be removed')).not.toBeVisible()
    await expect(page.getByText('remove@example.com')).not.toBeVisible()

    console.log(`[profile] ✅ Remove records succeeded for ${name}`)
  })

  test('shows validation errors for invalid records', async ({
    profileConnectedPage: page,
    makeV2Name,
  }) => {
    const name = await makeV2Name({ label: 'profileval' })
    console.log(`[profile] name for validation-error test: ${name}`)

    await goToEditProfile(page, name)

    // General tab: Custom link is visible by default — fill with an invalid URL.
    // Validation fires immediately on change.
    await page.getByPlaceholder('https://yourwebsite.com').fill('not-a-url')
    await expect(
      page.getByText('Enter a valid URL (e.g. https://example.com)'),
    ).toBeVisible({ timeout: 10_000 })

    // Contact tab: enable E-mail then fill with an invalid address.
    await page.getByRole('tab', { name: 'Contact' }).click()
    await page
      .getByRole('button', { name: 'E-mail' })
      .and(page.locator(':not([aria-pressed])'))
      .click()
    await page.getByLabel('E-mail', { exact: true }).fill('not-an-email')
    await expect(page.getByText('Enter a valid email address')).toBeVisible({
      timeout: 10_000,
    })

    // Addresses tab: fill the ETH address with a non-address value.
    await page.getByRole('tab', { name: 'Addresses' }).click()
    await page.getByLabel('Your Ethereum Address').fill('not-an-address')
    await expect(page.getByText('Enter a valid Ethereum address')).toBeVisible({
      timeout: 10_000,
    })

    // Links tab: fill only the URL field with an invalid URL — the draft stays
    // a draft (title is empty) but validation still runs on non-empty drafts.
    // Use exact match to distinguish from the General-tab "Enter a valid URL
    // (e.g. https://example.com)" message which may still be in the DOM.
    await page.getByRole('tab', { name: 'Links' }).click()
    await page.getByRole('textbox', { name: 'Link 1 URL' }).fill('not-a-url')
    await expect(
      page.getByText('Enter a valid URL', { exact: true }),
    ).toBeVisible({ timeout: 10_000 })

    console.log(`[profile] ✅ Validation errors correctly shown for ${name}`)
  })

  test('add and remove name from favourites', {
    tag: ['@scenario:H7'],
  }, async ({
    // Favorites require backend auth — the FavoriteButton's
    // `disabled` prop is bound to `useAtom(isBackendAuthed)` and
    // the API mutations call the deployed worker. Use the
    // sign-in fixture variant so the heart button is interactive.
    profileAuthenticatedPageWithBackend: page,
    makeV2Name,
  }) => {
    test.skip(
      process.env.E2E_MOCK_INDEXER === 'true',
      'Requires real indexer (SSR bypasses Playwright mock)',
    )
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
    // never miss a fast response. The new profile view uses aria-labels
    // "Add favorite" / "Remove favorite" instead of a Lucide heart icon.
    await page
      .getByRole('button', { name: /(Add|Remove) favorite/ })
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })

    // If already favourited from a previous retry, unfavourite first so the
    // dashboard assertion (name IN Favorites) is reliable.
    const isAlreadyFavourited = await page
      .getByRole('button', { name: 'Remove favorite' })
      .first()
      .isVisible()
    if (isAlreadyFavourited) {
      const removePrior = page.waitForResponse(
        (resp) =>
          resp.url().includes('/favorites') &&
          resp.request().method() === 'DELETE',
        { timeout: 10_000 },
      )
      await page
        .getByRole('button', { name: 'Remove favorite' })
        .first()
        .click()
      await removePrior
    }

    const addDone = page.waitForResponse(
      (resp) =>
        resp.url().includes('/favorites') && resp.request().method() === 'PUT',
      { timeout: 10_000 },
    )
    await page.getByRole('button', { name: 'Add favorite' }).first().click()
    await addDone

    // Verify name appears under the Favorites tab on the dashboard.
    // Search by name to avoid pagination hiding it on a later page — the
    // favorites list defaults to alphabetical sort, not recency.
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    await page.getByText('Favorites').click()
    await page.getByPlaceholder('Search my names').fill(name)
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 })

    // Remove from favourites — listener registered before click, then wait for it
    await goToProfile(page, name)
    await page.waitForTimeout(3_000)
    await page
      .getByRole('button', { name: 'Remove favorite' })
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })

    const removeDone = page.waitForResponse(
      (resp) =>
        resp.url().includes('/favorites') &&
        resp.request().method() === 'DELETE',
      { timeout: 10_000 },
    )
    await page.getByRole('button', { name: 'Remove favorite' }).first().click()
    await removeDone

    // Verify name is gone from the Favorites tab.
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    await page.getByText('Favorites').click()
    await page.waitForTimeout(2_000)
    await expect(page.getByText(name).first()).not.toBeVisible({
      timeout: 10_000,
    })

    console.log(`[profile] ✅ Favourites add/remove succeeded for ${name}`)
  })

  test('can favourite a name not owned by the user', {
    tag: ['@scenario:H7'],
  }, async ({
    // Same backend-auth requirement as the owned-name favorites
    // test above — see comment there.
    profileAuthenticatedPageWithBackend: page,
    makeV2Name,
  }) => {
    // Skip when indexer is mocked — page.goto('/dashboard') triggers SSR which
    // bypasses Playwright's route interceptor, causing the server to redirect to /.
    // The owned-name favourite test already covers the full favourite flow.
    test.skip(
      process.env.E2E_MOCK_INDEXER === 'true',
      'Requires real indexer (SSR bypasses Playwright mock)',
    )

    // Register a name owned by a different account so the authenticated
    // user can favourite it without being the owner.
    const name = await makeV2Name({
      label: 'otherfav',
      owner: 'other',
      records: [{ key: 'description', value: "someone else's name" }],
    })
    console.log(`[profile] name for other-favourite test: ${name}`)

    await page.goto(`${MANAGER_APP_URL}/p/${name}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3_000)

    // Favourite it
    await page
      .getByRole('button', { name: 'Add favorite' })
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByRole('button', { name: 'Add favorite' }).first().click()
    await page.waitForTimeout(2_000)

    // Verify it appears in the Favorites tab on the dashboard.
    // Search by name to avoid pagination hiding it on a later page — the
    // favorites list defaults to alphabetical sort, not recency.
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    await page.getByText('Favorites').click()
    await page.getByPlaceholder('Search my names').fill(name)
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 })

    // Remove from favourites — go back to the profile page and click the heart again
    await page.goto(`${MANAGER_APP_URL}/p/${name}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3_000)
    await page
      .getByRole('button', { name: 'Remove favorite' })
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByRole('button', { name: 'Remove favorite' }).first().click()
    await page.waitForTimeout(2_000)

    // Verify name is gone from the Favorites tab
    await page.goto(`${MANAGER_APP_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    await page.getByText('Favorites').click()
    await page.waitForTimeout(2_000)
    await expect(page.getByText(name)).not.toBeVisible({ timeout: 10_000 })

    console.log(
      `[profile] ✅ Favouriting a non-owned name succeeded for ${name}`,
    )
  })

  test('extend owned name by 28 days', {
    tag: ['@scenario:B1'],
  }, async ({ profileConnectedPage: page, makeV2Name, wallet }) => {
    const name = await makeV2Name({ label: 'extendowned' })
    const label = name.replace(/\.eth$/, '')
    console.log(`[profile] name for extend-owned test: ${name}`)

    const expiryBefore = await readExpiry(label)

    await goToProfile(page, name)
    await page.getByRole('link', { name: /renew/i }).click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2_000)

    // renewFor28Days clicks "Pay with stablecoins", dismisses the
    // EnableSessions modal (HCA path), selects USDC, and awaits
    // "Renewal Complete!". On the HCA path USDC is authorized via an
    // EIP-2612 permit (eth_signTypedData_v4, auto-authorized) — no
    // eth_sendTransaction. Fire authorization in the background for
    // EOA-mode compatibility; the .catch absorbs the timeout.
    // 120 s budget: clickThroughEnableSessions inside renewFor28Days
    // blocks for up to 30 s in EOA mode before no-oping, so 60 s was
    // too tight — the USDC sendTransaction arrives ~35 s in.
    void authorizeTransaction(wallet, 120_000).catch(() => {})
    const expiry = await renewFor28Days(page)
    console.log(
      `[profile] ✅ Extend owned name by 28 days succeeded for ${name}, expires ${expiry}`,
    )

    // B1's oracle is the arithmetic itself — the UI showing the right date
    // string is not proof the registrar actually moved the expiry.
    const expiryAfter = await readExpiry(label)
    const TWENTY_EIGHT_DAYS = 28n * 24n * 60n * 60n
    expect(
      expiryAfter - expiryBefore,
      `expiry moved by ${expiryAfter - expiryBefore}s, expected exactly ${TWENTY_EIGHT_DAYS}s (28 days)`,
    ).toBe(TWENTY_EIGHT_DAYS)
  })

  test('extend unowned name by 28 days', { tag: ['@scenario:B2'] }, async ({
    profileConnectedPage: page,
    makeV2Name,
    wallet,
  }) => {
    const name = await makeV2Name({ label: 'extendunowned', owner: 'other' })
    console.log(`[profile] name for extend-unowned test: ${name}`)

    await page.goto(`${MANAGER_APP_URL}/p/${name}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3_000)

    // For non-owners the new profile view shows a ThirdPartyRenewalDialog before
    // navigating — click the button to open it, then confirm with "I Understand".
    await page.getByRole('button', { name: /renew name/i }).click()
    await page.getByRole('link', { name: /i understand/i }).click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2_000)

    // Same as the owned-name extend test: HCA path uses a permit (no
    // eth_sendTransaction). Fire authorization in the background for EOA
    // compatibility; 120 s for the same reason as above (extra navigation
    // via ThirdPartyRenewalDialog tightens the budget further).
    void authorizeTransaction(wallet, 120_000).catch(() => {})
    const expiry = await renewFor28Days(page)
    console.log(
      `[profile] ✅ Extend unowned name by 28 days succeeded for ${name}, expires ${expiry}`,
    )
  })

  /**
   * B3 — V2's grace period is 28 days (`V2_GRACE_PERIOD_DAYS`,
   * `apps/manager/src/features/grace/utils/gracePeriod.ts`). The oracle is
   * specifically that a grace-period renewal extends from the name's own
   * *stored* expiry, not from "now" — a real bug class, since "now" is always
   * later than a stored expiry that's already in the past, and the two are
   * easy to conflate when the UI computes a renewal window. Day 1 and day 27
   * bracket the window on both ends, per the catalogue.
   *
   * If the app used "now" instead, the +28-day delta below would not hold —
   * it would be inflated by however many days of grace had already elapsed —
   * which is exactly the failure this asserts against.
   *
   * Two literal `test()` calls, not a loop over a template-literal title:
   * `coverage/reconcile.ts`'s `scanSpec` reads titles statically from source
   * text, so a title built from an interpolated loop variable never matches
   * either concrete test playwright actually runs — both instances silently
   * report `excluded` instead of `PASS`. Caught the same way as last
   * iteration's apostrophe bug: a coverage-count mismatch, not an error.
   */
  async function extendsInGrace(
    page: Page,
    wallet: Web3ProviderBackend,
    makeV2Name: (config: V2NameConfig) => Promise<string>,
    daysSinceExpiry: number,
  ) {
    const name = await makeV2Name({
      label: `graceday${daysSinceExpiry}`,
      duration: -(daysSinceExpiry * 24 * 60 * 60),
    })
    const label = name.replace(/\.eth$/, '')
    console.log(
      `[profile] name for grace-day-${daysSinceExpiry} extend test: ${name}`,
    )

    const expiryBefore = await readExpiry(label)

    // Direct to `/renew/$name` rather than through the profile page's
    // "Renew" link: `apps/manager/src/routes/renew/$name.tsx`'s own loader
    // reads expiry straight from chain and is grace-aware (redirects to
    // `/register/$name` once past grace — that's B4's route, not B3's).
    // The profile route (`/p/$name`) renders "doesn't exist" for a
    // grace-period name — it isn't built to show one at all — so it isn't
    // a route this scenario can go through.
    await page.goto(`${MANAGER_APP_URL}/renew/${name}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2_000)

    // Same HCA-permit-vs-EOA-transaction accommodation as the other two
    // extend tests in this file.
    void authorizeTransaction(wallet, 120_000).catch(() => {})
    const expiry = await renewFor28Days(page)
    console.log(
      `[profile] ✅ Extend in grace (day ${daysSinceExpiry}) succeeded for ${name}, expires ${expiry}`,
    )

    const expiryAfter = await readExpiry(label)
    const TWENTY_EIGHT_DAYS = 28n * 24n * 60n * 60n
    expect(
      expiryAfter - expiryBefore,
      `expiry moved by ${expiryAfter - expiryBefore}s, expected exactly ${TWENTY_EIGHT_DAYS}s (28 days) from the ORIGINAL expiry — a renewal based on "now" instead would move it by a larger amount`,
    ).toBe(TWENTY_EIGHT_DAYS)
  }

  test('extends a name in grace (day 1) from its original expiry, not from now', {
    tag: ['@scenario:B3'],
  }, async ({ profileConnectedPage: page, makeV2Name, wallet }) => {
    await extendsInGrace(page, wallet, makeV2Name, 1)
  })

  test('extends a name in grace (day 27) from its original expiry, not from now', {
    tag: ['@scenario:B3'],
  }, async ({ profileConnectedPage: page, makeV2Name, wallet }) => {
    await extendsInGrace(page, wallet, makeV2Name, 27)
  })

  /**
   * B5 — the renewal calendar (`RenewToDatePopover`,
   * `apps/manager/src/features/bulk-renew/components/RenewToDatePopover.tsx`
   * — shared by bulk and single-name renewal) disables every day before
   * `minSelectableDate` (current expiry + the minimum renewal period) via
   * `disabled={(date) => date < minDate}`, which react-day-picker renders as
   * a real HTML `disabled` button attribute. The calendar opens on whichever
   * duration is already pre-selected (the default "1 year" tier), not on
   * its own minimum, and its "previous month" control stays enabled well
   * short of that boundary — so proving the boundary means navigating back
   * into it (via the caption's month/year selects, not repeated clicks —
   * `captionLayout="dropdown"`'s invisible overlay select intercepts the nav
   * button after a few clicks), not just checking the initial screen.
   */
  test('never offers a renewal date before the current expiry', {
    // Also B11's "connected" case: a connected user reaching this active
    // name entirely via the /renew/$name deep link (not the profile page).
    tag: ['@scenario:B5', '@scenario:B11'],
  }, async ({ profileConnectedPage: page, makeV2Name }) => {
    const name = await makeV2Name({ label: 'norollback' })
    console.log(`[profile] name for no-rollback calendar test: ${name}`)

    await page.goto(`${MANAGER_APP_URL}/renew/${name}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2_000)

    await page.getByRole('button', { name: /renew to date/i }).click()
    const calendar = page.locator('[data-slot="calendar"]')
    await calendar.waitFor({ state: 'visible' })

    // Try to jump all the way back to today's real month via the caption's
    // own month/year selects, rather than clicking "previous" repeatedly
    // (`captionLayout="dropdown"` overlays an invisible <select> on the
    // caption that, a few clicks in, starts intercepting the nav button's
    // pointer events). Today is comfortably before any legitimate renewal
    // target, since the minimum renewal period alone pushes
    // `minSelectableDate` weeks out.
    const today = new Date()
    await calendar
      .getByLabel('Choose the Month')
      .selectOption({ label: today.toLocaleString('en-US', { month: 'long' }) })
    await calendar
      .getByLabel('Choose the Year')
      .selectOption(String(today.getFullYear()))

    // `startMonth={minSelectableDate}` means the request above can only ever
    // land AT OR AFTER minSelectableDate's month — asking for today's month
    // clamps forward to the earliest reachable one instead of erroring or
    // no-opping (measured: it clamped to a month over a month later than
    // today). Within whatever month that is, the first day cell is the
    // earliest day the calendar can show at all; if the boundary holds, that
    // day is still disabled (`disabled={(date) => date < minDate}`, which
    // react-day-picker renders as a real `disabled` attribute, not `aria-
    // disabled`) — proof the UI cannot be walked back to a date before the
    // current expiry, however it's driven.
    const firstDayCell = calendar
      .getByRole('gridcell')
      .filter({ hasText: /^\d+$/ })
      .first()
    await expect(
      firstDayCell.getByRole('button'),
      "the earliest day cell reachable after asking for today's month must still be disabled — the UI must never offer a renewal target before the current expiry",
    ).toBeDisabled()
  })

  /**
   * B11 (unregistered case) — `apps/manager/src/routes/renew/$name.tsx`'s
   * loader throws when `profileExpiryQuery` reports no v2 protocol, which is
   * exactly what an available (never registered) name reports. The route's
   * own `errorComponent` (`RenewalRouteError`) renders a real, informative
   * page rather than a stack trace or a blank screen — that graceful
   * degradation is the thing worth locking in.
   */
  test('shows a graceful error for an unregistered name via the renew deep link', {
    tag: ['@scenario:B11'],
  }, async ({ profileConnectedPage: page }) => {
    const unregisteredName = `b11-never-registered-${Date.now()}.eth`

    await page.goto(`${MANAGER_APP_URL}/renew/${unregisteredName}`)

    await expect(
      page.getByRole('heading', { name: /can.t be renewed here/i }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole('link', { name: /back to profile/i }),
    ).toBeVisible()
  })

  /**
   * B11 (disconnected case) — the route's own loader reads expiry straight
   * from chain and does not gate on wallet connection, so a disconnected
   * visitor reaches the same renewal UI as a connected one; the gate is
   * lower, inside the payment step (`useSmartAccountContext().isConnected`,
   * same mechanism `TokenPickerContentBase` in registration checks).
   */
  test('offers a connect prompt, not a broken page, for a disconnected visitor', {
    tag: ['@scenario:B11'],
  }, async ({ page, makeV2Name }) => {
    const name = await makeV2Name({ label: 'b11disconnected' })
    console.log(`[profile] name for disconnected deep-link test: ${name}`)

    await page.goto(`${MANAGER_APP_URL}/renew/${name}`)
    await page.waitForLoadState('networkidle')

    // The page itself renders — the loader doesn't require a connection —
    // and the connect affordance appears where payment would otherwise be.
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(/connect/i).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('displays an agent-registration record as a labelled, copyable card', async ({
    connectedPage: page,
    makeV2Name,
  }) => {
    // ENSIP-25 agent-registration text record. The KEY encodes an ERC-7930
    // registry address (mainnet 8004.eth, chain 1) plus the agent id; the
    // stored value is the placeholder presence flag "1". The card resolves
    // the registry to its known primary name and copies the FULL RAW KEY to
    // the clipboard — not the parsed agent id and not the placeholder "1"
    // (WEB-569 req 4).
    const agentRecordKey =
      'agent-registration[0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432][19151]'
    const name = await makeV2Name({
      label: 'agentrec',
      records: [{ key: agentRecordKey, value: '1' }],
    })
    console.log(`[profile] name for agent-record test: ${name}`)

    // The copy button writes to (and the assertion reads from) the clipboard.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

    await goToProfile(page, name)

    // Labelled card renders with the resolved Registry + Agent ID (req 2 & 3).
    const card = page.getByTestId('agent-record-card-19151')
    await expect(card).toBeVisible({ timeout: 20_000 })
    await expect(card.getByText('Registry')).toBeVisible()
    await expect(card.getByText('Agent ID')).toBeVisible()
    await expect(card.getByText('8004.eth')).toBeVisible()
    await expect(card.getByText('19151')).toBeVisible()

    // Copy yields the full raw text-record value (req 4).
    await page.getByTestId('agent-record-copy-19151').click()
    await expect
      .poll(async () => page.evaluate(() => navigator.clipboard.readText()), {
        timeout: 10_000,
      })
      .toBe(agentRecordKey)

    console.log(`[profile] ✅ Agent-record card displayed & copied for ${name}`)
  })
})
