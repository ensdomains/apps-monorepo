import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { Web3RequestKind } from '@ensdomains/headless-web3-provider'
import {
  type Address,
  erc721Abi,
  labelhash,
  namehash,
  stringToHex,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getDestinationContracts } from '../../../../packages/smart-account/src/providers/rhinestone/manifest.ts'
import { createMakeV1Name } from '../../../fixtures/makeV1Name.js'
import {
  test as baseTest,
  createAccounts,
  expect,
} from '../../../fixtures/playwright.manager.fixture.js'
import {
  publicClient,
  testClient,
  walletClient,
} from '../../../helpers/anvil-client.js'
import {
  assertUnlockedTokenRoute,
  assertV2Reserved,
} from '../../../helpers/migration-assertions.js'
import {
  confirmAndAuthorize,
  openMigrationFlow,
  readPlan,
  rootRow,
  selectOnlyRoots,
} from '../../../helpers/migration-flow.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

const BASE_REGISTRAR =
  ensL1Contracts[supportedL1Chains.sepolia].ensBaseRegistrarImplementation
    .address
const MIGRATION_HELPER = getDestinationContracts(
  supportedL1Chains.sepolia,
).migrationHelper

const test = baseTest.extend({
  accounts: async ({ accounts: _baseAccounts }, use) => {
    const isolated = createAccounts(30_000_000 + (Date.now() % 10_000_000))
    await testClient.setBalance({
      address: isolated.getAddress('user'),
      value: 100n * 10n ** 18n,
    })
    await use(isolated)
  },
})

test(
  'a permission removed after preview requires a new estimate and offers no ineffective retry (WEB-1946)',
  { tag: ['@smoke'] },
  async ({ migrationConnectedPage: page, wallet, accounts }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const name = await makeV1Name({ label: 'web1946-plan-change' })
    const label = name.replace(/\.eth$/, '')
    const approve = async (operator: Address) => {
      const hash = await walletClient.writeContract({
        account: owner,
        address: BASE_REGISTRAR,
        abi: erc721Abi,
        functionName: 'approve',
        args: [operator, BigInt(labelhash(label))],
      })
      expect(
        (await publicClient.waitForTransactionReceipt({ hash })).status,
      ).toBe('success')
    }
    await approve(MIGRATION_HELPER)
    expect(
      await publicClient.readContract({
        address: BASE_REGISTRAR,
        abi: erc721Abi,
        functionName: 'isApprovedForAll',
        args: [owner.address, MIGRATION_HELPER],
      }),
    ).toBe(false)
    await serveV1Names(page, [
      { name, ownerAddress: owner.address, type: 'unwrapped' },
    ])
    await openMigrationFlow(page)
    await expect(rootRow(page, name)).toBeVisible({ timeout: 60_000 })
    await selectOnlyRoots(page, [name])
    await readPlan(page)

    await approve(zeroAddress)
    await page
      .getByRole('button', { name: 'Upgrade 1 name', exact: true })
      .click()
    await expect(
      page.getByText("Upgrade didn't finish", { exact: true }),
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page.getByText(/go back to check the updated estimate/i),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Try again', exact: true }),
    ).toHaveCount(0)
    expect(wallet.getPendingRequestCount(Web3RequestKind.SendTransaction)).toBe(
      0,
    )
    expect(
      await publicClient.readContract({
        address: BASE_REGISTRAR,
        abi: erc721Abi,
        functionName: 'ownerOf',
        args: [BigInt(labelhash(label))],
      }),
    ).toBe(owner.address)
    await assertV2Reserved(label)
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('plan-changed-mobile.png'),
    })

    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(rootRow(page, name)).toBeVisible({ timeout: 60_000 })
    await readPlan(page)
    await confirmAndAuthorize(page, wallet)
    await assertUnlockedTokenRoute(label, namehash(name), { wrapped: false })
  },
)

test(
  'a live gas split adds a progress step before the extra wallet prompt (WEB-1946)',
  { tag: ['@smoke'] },
  async ({ migrationConnectedPage: page, wallet, accounts }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const makeV1Name = createMakeV1Name({ userAccount: owner })
    const names = [
      await makeV1Name({ label: 'web1946-split-a' }),
      await makeV1Name({ label: 'web1946-split-b' }),
    ]
    await serveV1Names(
      page,
      names.map((name) => ({
        name,
        ownerAddress: owner.address,
        type: 'unwrapped',
      })),
    )
    await openMigrationFlow(page)
    for (const name of names)
      await expect(rootRow(page, name)).toBeVisible({ timeout: 60_000 })
    await selectOnlyRoots(page, names)
    const preview = await readPlan(page)
    expect(preview.steps.filter((step) => /^Upgrade /.test(step))).toHaveLength(
      1,
    )

    const encodedLabels = names.map((name) =>
      stringToHex(name.replace(/\.eth$/, '')).slice(2),
    )
    let splitEstimates = 0
    await page.route(
      /^(?:http:\/\/(?:localhost|127\.0\.0\.1):\d+|https:\/\/(?:ethereum-sepolia-rpc\.publicnode\.com|sepolia\.gateway\.tenderly\.co|lb\.drpc\.live\/sepolia))(\/|$)/,
      async (route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        const body: unknown = route.request().postDataJSON()
        const messages: readonly unknown[] = Array.isArray(body) ? body : [body]
        const hasCombinedEstimate = messages.some(
          (message) =>
            typeof message === 'object' &&
            message !== null &&
            'method' in message &&
            message.method === 'eth_estimateGas' &&
            encodedLabels.every((label) =>
              JSON.stringify(message).includes(label),
            ),
        )
        if (!hasCombinedEstimate) return route.fallback()
        const response = await route.fetch({
          url: process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545',
        })
        const responses: unknown = await response.json()
        const withLiveGas = (entry: unknown): unknown => {
          if (typeof entry !== 'object' || entry === null || !('id' in entry))
            return entry
          const request = messages.find(
            (message) =>
              typeof message === 'object' &&
              message !== null &&
              'id' in message &&
              message.id === entry.id,
          )
          if (
            typeof request !== 'object' ||
            request === null ||
            !('method' in request) ||
            request.method !== 'eth_estimateGas' ||
            !encodedLabels.every((label) =>
              JSON.stringify(request).includes(label),
            )
          )
            return entry
          splitEstimates += 1
          return { jsonrpc: '2.0', id: entry.id, result: '0xf42400' }
        }
        await route.fulfill({
          response,
          json: Array.isArray(responses)
            ? responses.map(withLiveGas)
            : withLiveGas(responses),
        })
      },
    )

    await page
      .getByRole('button', { name: 'Upgrade 2 names', exact: true })
      .click()
    const success = page.getByRole('heading', {
      name: /your names? (has|have) been upgraded/i,
    })
    let prompts = 0
    let progress: readonly {
      readonly completed: number
      readonly total: number
    }[] = []
    while (!(await success.isVisible()) && prompts <= preview.count + 2) {
      await expect
        .poll(
          async () =>
            (await success.isVisible()) ||
            wallet.getPendingRequestCount(Web3RequestKind.SendTransaction) > 0,
          { timeout: 120_000 },
        )
        .toBe(true)
      if (await success.isVisible()) break
      const bar = page.getByRole('progressbar', { name: 'Upgrade progress' })
      const completed = Number(await bar.getAttribute('aria-valuenow'))
      const total = Number(await bar.getAttribute('aria-valuemax'))
      expect(
        completed,
        'an open wallet prompt must not show completed progress',
      ).toBeLessThan(total)
      progress = [...progress, { completed, total }]
      prompts += 1
      await wallet.authorize(Web3RequestKind.SendTransaction)
    }
    await expect(success).toBeVisible()
    expect(splitEstimates).toBeGreaterThan(0)
    expect(prompts).toBe(preview.count + 1)
    expect(progress.at(-1)?.total).toBe(preview.count + 1)
    for (const name of names)
      await assertUnlockedTokenRoute(
        name.replace(/\.eth$/, ''),
        namehash(name),
        {
          wrapped: false,
        },
      )
    await testInfo.attach('live-progress.json', {
      body: JSON.stringify({ preview, prompts, progress, splitEstimates }),
      contentType: 'application/json',
    })
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('split-success-desktop.png'),
    })
  },
)
