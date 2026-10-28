import {
  injectHeadlessWeb3Provider,
  type Web3ProviderBackend,
  Web3RequestKind,
} from '@ensdomains/headless-web3-provider'
import type { Page } from '@playwright/test'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
  authorizeTransaction,
  expect,
  test,
} from '../../../fixtures/playwright.manager.fixture.js'
import {
  connectWithHeadlessWallet,
  dismissBackendAuthModal,
  PERMITTED_SIGN_KINDS,
} from '../../../helpers/manager-auth.js'
import { createBignameMock } from '../../../helpers/mock-bigname.js'
import { mockV1Names } from '../../../helpers/mock-v1-names.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const ANVIL_RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'
const MIGRATION_JOURNAL_KEY =
  'ens-apps:atomic-hca-migration:submitted-batches:v1:8d1c893'
const localSepolia = {
  ...sepolia,
  rpcUrls: { default: { http: [ANVIL_RPC_URL] } },
} as const

const HEADLESS_USER_ADDRESS = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
).address

const openMigrationConfirmation = async (page: Page): Promise<void> => {
  await page.goto(`${MANAGER_APP_URL}/dashboard`)
  await page.waitForLoadState('networkidle')

  const upgradeButton = page
    .getByRole('button', { name: 'Upgrade Names' })
    .first()
  await upgradeButton.waitFor({ state: 'visible', timeout: 30_000 })
  await upgradeButton.click()

  await page
    .getByRole('button', { name: /^Upgrade \d+ names?$/ })
    .waitFor({ state: 'visible', timeout: 60_000 })
}

const connectSecondTab = async (
  page: Page,
  wallet: Web3ProviderBackend,
): Promise<void> => {
  await page.goto(MANAGER_APP_URL)
  await Promise.race([
    page.waitForLoadState('networkidle'),
    page.waitForTimeout(5_000),
  ]).catch(() => {})

  const connectButton = page.getByRole('button', {
    name: /^connect( login)?$/i,
  })
  if (await connectButton.isVisible().catch(() => false)) {
    await connectWithHeadlessWallet(page, wallet)
  }
  await dismissBackendAuthModal(page)
}

const readMigrationJournal = (page: Page): Promise<string | null> =>
  page.evaluate(
    (key) => window.localStorage.getItem(key),
    MIGRATION_JOURNAL_KEY,
  )

test.describe('migration cross-tab exclusion', () => {
  test.describe.configure({ timeout: 480_000 })

  test('a second tab cannot prompt or rewrite the active migration journal', async ({
    connectedPage: firstPage,
    wallet: firstWallet,
    accounts,
  }) => {
    const makeV1Name = createMakeV1Name({
      userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
    })
    const v1Name = await makeV1Name({ label: 'miglock' })
    const names = [{ name: v1Name, ownerAddress: HEADLESS_USER_ADDRESS }]
    await mockV1Names(firstPage, names)

    const secondPage = await firstPage.context().newPage()
    const secondBigname = createBignameMock()
    await secondBigname.install(secondPage)
    await mockV1Names(secondPage, names)
    const secondWallet = await injectHeadlessWeb3Provider({
      page: secondPage,
      privateKeys: accounts.getAllPrivateKeys(),
      chains: [localSepolia],
      permitted: [...PERMITTED_SIGN_KINDS],
    })
    await connectSecondTab(secondPage, secondWallet)

    await openMigrationConfirmation(firstPage)

    await firstPage
      .getByRole('button', { name: /^Upgrade \d+ names?$/ })
      .click()
    await authorizeTransaction(firstWallet, 90_000)
    await expect
      .poll(
        () =>
          firstWallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
        { timeout: 90_000 },
      )
      .toBe(1)

    try {
      const journalBefore = await readMigrationJournal(firstPage)
      expect(journalBefore).not.toBeNull()

      await openMigrationConfirmation(secondPage)
      await secondPage
        .getByRole('button', { name: /^Upgrade \d+ names?$/ })
        .click()

      await expect(
        secondPage.getByText(
          'Another tab is already upgrading names for this wallet. Return to that tab to finish the upgrade.',
        ),
      ).toBeVisible({ timeout: 30_000 })
      expect(
        secondWallet.getPendingRequestCount(Web3RequestKind.SendTransaction),
      ).toBe(0)
      expect(await readMigrationJournal(secondPage)).toBe(journalBefore)
    } finally {
      if (
        firstWallet.getPendingRequestCount(Web3RequestKind.SendTransaction) > 0
      ) {
        await authorizeTransaction(firstWallet, 90_000)
      }
    }

    await expect(
      firstPage.getByText('Your name has been upgraded!'),
    ).toBeVisible({
      timeout: 90_000,
    })
  })
})
