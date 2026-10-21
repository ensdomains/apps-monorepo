import type { Page } from '@playwright/test'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import type { MockDomain } from '../../../helpers/mock-bigname.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const DAY = 24 * 60 * 60

// Names here exist only in the bigname mock: these tests cover how the
// manager reads bigname, not the chain. Each test searches for its own prefix,
// so names other tests added to the shared mock never show up.
const uniquePrefix = (tag: string) => `${tag}${Date.now().toString(36)}`
const nowSeconds = () => Math.floor(Date.now() / 1000)

type MockBigname = {
  readonly addName: (domain: MockDomain) => void
}
const added: string[] = []
const addName = (mockBigname: MockBigname, domain: MockDomain) => {
  mockBigname.addName(domain)
  added.push(domain.name)
}

const openDashboard = async (page: Page, search: string) => {
  await page.goto(`${MANAGER_APP_URL}/dashboard`)
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('Search my names').fill(search)
}

// More than one bigname read (50 rows), so the last page needs the cursor.
const NAME_COUNT = 55
const LAST_PAGE = 11
const numberedNames = (prefix: string) =>
  Array.from(
    { length: NAME_COUNT },
    (_, index) => `${prefix}${String(index).padStart(2, '0')}.eth`,
  )

/** The page's rows, in order, are exactly these names. */
const expectRows = async (
  page: Page,
  prefix: string,
  names: readonly string[],
) => {
  const rows = page
    .getByText(new RegExp(`^${prefix}\\d+\\.eth$`))
    .filter({ visible: true })
  await expect
    .poll(
      async () => {
        const texts = await rows.allTextContents()
        // A row can render its name more than once for different screen sizes.
        return texts.filter((text, index) => text !== texts[index - 1])
      },
      { timeout: 20_000 },
    )
    .toEqual(names)
}

const expectListed = async (
  page: Page,
  shown: readonly string[],
  hidden: readonly string[] = [],
) => {
  // A row can render its name more than once for different screen sizes.
  const visible = (name: string) =>
    page.getByText(name, { exact: true }).filter({ visible: true })
  for (const name of shown) {
    await expect(visible(name).first()).toBeVisible({ timeout: 20_000 })
  }
  for (const name of hidden) {
    await expect(visible(name)).toHaveCount(0)
  }
}

test.describe('Names read from bigname', () => {
  test.beforeEach(({ mockBigname }) => {
    test.skip(!mockBigname.enabled, 'Names here exist only in the mock')
  })

  // The mock is shared by every test in a worker; later tests must not see
  // these names on their dashboard.
  test.afterEach(({ mockBigname }) => {
    for (const name of added.splice(0)) mockBigname.removeName(name)
  })

  test('the dashboard pages and sorts the names bigname lists', async ({
    connectedPage: page,
    mockBigname,
    accounts,
  }) => {
    const prefix = uniquePrefix('pg')
    const names = numberedNames(prefix)
    // The later the name, the sooner it expires.
    names.forEach((name, index) => {
      addName(mockBigname, {
        name,
        owner: accounts.getAddress('user'),
        expiryDate: nowSeconds() + (600 - index * 5) * DAY,
      })
    })

    await openDashboard(page, prefix)
    await expectRows(page, prefix, names.slice(0, 5))

    await page.getByRole('button', { name: `Go to page ${LAST_PAGE}` }).click()
    await expectRows(page, prefix, names.slice(50))

    await page.getByRole('button', { name: /^Sort by/ }).click()
    await page.getByRole('menuitemradio', { name: 'Expiry Date' }).click()
    await expectRows(page, prefix, names.slice(50).reverse())
  })

  test('the version chips list only ENSv1 or only ENSv2 names', async ({
    connectedPage: page,
    mockBigname,
    accounts,
  }) => {
    const prefix = uniquePrefix('ver')
    const v1Name = `${prefix}one.eth`
    const v2Name = `${prefix}two.eth`
    const owner = accounts.getAddress('user')
    addName(mockBigname, { name: v1Name, owner, protocol: 'v1' })
    addName(mockBigname, { name: v2Name, owner })

    await openDashboard(page, prefix)
    await expectListed(page, [v1Name, v2Name])

    await page.getByRole('button', { name: /^V1/ }).click()
    await expectListed(page, [v1Name], [v2Name])

    await page.getByRole('button', { name: /^V2/ }).click()
    await expectListed(page, [v2Name], [v1Name])

    // Clicking the active chip lists both again.
    await page.getByRole('button', { name: /^V2/ }).click()
    await expectListed(page, [v1Name, v2Name])
  })

  test('the dashboard keeps an ENSv2 name in grace', async ({
    connectedPage: page,
    mockBigname,
    accounts,
  }) => {
    const prefix = uniquePrefix('grace')
    const lapsed = `${prefix}lapsed.eth`
    const held = `${prefix}held.eth`
    const owner = accounts.getAddress('user')
    addName(mockBigname, {
      name: lapsed,
      owner,
      expiryDate: nowSeconds() - 3 * DAY,
    })
    addName(mockBigname, { name: held, owner })

    await openDashboard(page, prefix)
    await expectListed(page, [held, lapsed])
  })

  test('the grace banner names the ENSv2 name that expired first, with its grace end and a Renew link', {
    tag: ['@scenario:B7', '@scenario:B6'],
  }, async ({ connectedPage: page, mockBigname, accounts }) => {
    const prefix = uniquePrefix('graceb')
    const owner = accounts.getAddress('user')
    const first = `${prefix}first.eth`
    const second = `${prefix}second.eth`
    const active = `${prefix}active.eth`
    const v1 = `${prefix}vone.eth`
    const firstExpiry = nowSeconds() - 10 * DAY
    addName(mockBigname, {
      name: second,
      owner,
      expiryDate: nowSeconds() - 3 * DAY,
    })
    addName(mockBigname, { name: first, owner, expiryDate: firstExpiry })
    addName(mockBigname, { name: active, owner })
    // An ENSv1 name in grace that expired even earlier: the dashboard banner
    // renews ENSv2 names only, so it must not win.
    addName(mockBigname, {
      name: v1,
      owner,
      expiryDate: nowSeconds() - 20 * DAY,
      protocol: 'v1',
    })

    await openDashboard(page, prefix)
    await expectListed(page, [first, second, active, v1])

    // One banner, for the name that expired first.
    await expect(page.getByText('One of your names expired.')).toBeVisible({
      timeout: 20_000,
    })
    const renew = page.getByRole('link', { name: 'Renew', exact: true })
    await expect(renew).toHaveCount(1)
    await expect(renew).toHaveAttribute('href', `/renew/${first}`)
    const graceEnd = new Date(
      (firstExpiry + 28 * DAY) * 1000,
    ).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    await expect(
      page.getByText(/now in its 28-day grace period/),
      "the grace end is the first name's expiry + 28 days",
    ).toContainText(graceEnd.replace(/^(\w+) /, (m) => m))

    // The badge marks every name in grace — ENSv1 too (the banner skips
    // those; the badge does not) — and never an active one. A row is the
    // outermost element holding exactly one "More options" control.
    const rowOf = (name: string) =>
      page
        .getByRole('button', { name: `More options for ${name}`, exact: true })
        .locator(
          'xpath=ancestor::div[count(.//button[starts-with(@aria-label,"More options for")])=1][last()]',
        )
    for (const name of [first, second, v1])
      await expect(
        rowOf(name).getByText('Grace period').first(),
        `${name} carries the grace badge`,
      ).toBeVisible()
    await expect(rowOf(active).getByText('Grace period')).toHaveCount(0)
  })

  test('your profile splits the names you own from the ones you manage', async ({
    profileConnectedPage: page,
    mockBigname,
    accounts,
  }) => {
    const prefix = uniquePrefix('role')
    const owned = `${prefix}own.eth`
    const managed = `${prefix}mgd.eth`
    const address = accounts.getAddress('user')
    addName(mockBigname, { name: owned, owner: address })
    addName(mockBigname, {
      name: managed,
      owner: address,
      relations: ['manager'],
    })

    await page.goto(`${MANAGER_APP_URL}/${address}`)
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder('Search names').fill(prefix)
    await expectListed(page, [owned], [managed])

    await page.getByRole('button', { name: /^Managed/ }).click()
    await expectListed(page, [managed], [owned])
  })

  test("someone else's profile pages their names, newest first", async ({
    profileConnectedPage: page,
    mockBigname,
    accounts,
  }) => {
    const prefix = uniquePrefix('prof')
    const address = accounts.getAddress('user2')
    const names = numberedNames(prefix)
    // The later the name, the newer it is.
    names.forEach((name, index) => {
      addName(mockBigname, {
        name,
        owner: address,
        createdAt: nowSeconds() - (100 - index) * DAY,
      })
    })
    const newestFirst = [...names].reverse()

    await page.goto(`${MANAGER_APP_URL}/${address}`)
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder('Search names').fill(prefix)
    await expectRows(page, prefix, newestFirst.slice(0, 5))

    await page.getByRole('button', { name: `Go to page ${LAST_PAGE}` }).click()
    await expectRows(page, prefix, newestFirst.slice(50))
  })
})
