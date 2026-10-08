import type { Page } from '@playwright/test'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import type { MockDomain } from '../../../helpers/mock-indexer.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const DAY = 24 * 60 * 60

// Names here exist only in the bigname mock: these tests cover how the
// manager reads bigname, not the chain. Each test searches for its own prefix,
// so names other tests added to the shared mock never show up.
const uniquePrefix = (tag: string) => `${tag}${Date.now().toString(36)}`
const nowSeconds = () => Math.floor(Date.now() / 1000)

type MockIndexer = {
  readonly addName: (domain: MockDomain) => void
}
const added: string[] = []
const addName = (mockIndexer: MockIndexer, domain: MockDomain) => {
  mockIndexer.addName(domain)
  added.push(domain.name)
}

const openDashboard = async (page: Page, search: string) => {
  await page.goto(`${MANAGER_APP_URL}/dashboard`)
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('Search my names').fill(search)
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
  test.beforeEach(({ mockIndexer }) => {
    test.skip(!mockIndexer.enabled, 'Names here exist only in the mock')
  })

  // The mock is shared by every test in a worker; later tests must not see
  // these names on their dashboard.
  test.afterEach(({ mockIndexer }) => {
    for (const name of added.splice(0)) mockIndexer.removeName(name)
  })

  test('the dashboard pages and sorts the names bigname lists', async ({
    connectedPage: page,
    mockIndexer,
    accounts,
  }) => {
    const prefix = uniquePrefix('pg')
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(
      (letter) => `${prefix}${letter}.eth`,
    )
    // The later the letter, the sooner it expires.
    names.forEach((name, index) => {
      addName(mockIndexer, {
        name,
        owner: accounts.getAddress('user'),
        expiryDate: nowSeconds() + (400 - index * 10) * DAY,
      })
    })

    await openDashboard(page, prefix)
    await expectListed(page, names.slice(0, 5), names.slice(5))

    await page.getByRole('button', { name: 'Go to page 2' }).click()
    await expectListed(page, names.slice(5), names.slice(0, 5))

    await page.getByRole('button', { name: /^Sort by/ }).click()
    await page.getByRole('menuitemradio', { name: 'Expiry Date' }).click()
    await expectListed(page, names.slice(2).reverse(), names.slice(0, 2))
  })

  test('the version chips list only ENSv1 or only ENSv2 names', async ({
    connectedPage: page,
    mockIndexer,
    accounts,
  }) => {
    const prefix = uniquePrefix('ver')
    const v1Name = `${prefix}one.eth`
    const v2Name = `${prefix}two.eth`
    const owner = accounts.getAddress('user')
    addName(mockIndexer, { name: v1Name, owner, protocol: 'v1' })
    addName(mockIndexer, { name: v2Name, owner })

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
    mockIndexer,
    accounts,
  }) => {
    const prefix = uniquePrefix('grace')
    const lapsed = `${prefix}lapsed.eth`
    const held = `${prefix}held.eth`
    const owner = accounts.getAddress('user')
    addName(mockIndexer, {
      name: lapsed,
      owner,
      expiryDate: nowSeconds() - 3 * DAY,
    })
    addName(mockIndexer, { name: held, owner })

    await openDashboard(page, prefix)
    await expectListed(page, [held, lapsed])
  })

  test('your profile splits the names you own from the ones you manage', async ({
    profileConnectedPage: page,
    mockIndexer,
    accounts,
  }) => {
    const prefix = uniquePrefix('role')
    const owned = `${prefix}own.eth`
    const managed = `${prefix}mgd.eth`
    const address = accounts.getAddress('user')
    addName(mockIndexer, { name: owned, owner: address })
    addName(mockIndexer, {
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
    mockIndexer,
    accounts,
  }) => {
    const prefix = uniquePrefix('prof')
    const address = accounts.getAddress('user2')
    const names = ['a', 'b', 'c', 'd', 'e', 'f'].map(
      (letter) => `${prefix}${letter}.eth`,
    )
    // The later the letter, the newer the name.
    names.forEach((name, index) => {
      addName(mockIndexer, {
        name,
        owner: address,
        createdAt: nowSeconds() - (100 - index) * DAY,
      })
    })
    const newestFirst = [...names].reverse()

    await page.goto(`${MANAGER_APP_URL}/${address}`)
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder('Search names').fill(prefix)
    await expectListed(page, newestFirst.slice(0, 5), newestFirst.slice(5))

    await page.getByRole('button', { name: 'Go to page 2' }).click()
    await expectListed(page, newestFirst.slice(5), newestFirst.slice(0, 5))
  })
})
