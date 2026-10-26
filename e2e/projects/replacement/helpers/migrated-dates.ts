import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Page } from '@playwright/test'
import { type Address, labelhash, parseAbi } from 'viem'
import {
  type AppSession,
  expect,
  MANAGER_APP_URL,
  PORTAL_APP_URL,
} from '../../../fixtures/playwright.cross-app.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'

const abi = parseAbi([
  'function getSubregistry(string) view returns(address)',
  'function getExpiry(uint256) view returns(uint64)',
])
async function expiryOf(name: string) {
  let registry = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
    .address as Address
  const labels = name.split('.').slice(0, -1).reverse()
  for (const label of labels.slice(0, -1))
    registry = await publicClient.readContract({
      address: registry,
      abi,
      functionName: 'getSubregistry',
      args: [label],
    })
  return publicClient.readContract({
    address: registry,
    abi,
    functionName: 'getExpiry',
    args: [BigInt(labelhash(labels.at(-1)!))],
  })
}
async function checkExpiry(page: Page, name: string) {
  const expiry = await expiryOf(name)
  await page.goto(`${PORTAL_APP_URL}/${name}/ownership`)
  await expect(page.getByRole('heading', { name: /Ownership$/ })).toBeVisible()
  await expect(
    page.getByText('Loading expiry and registration data', { exact: true }),
  ).toHaveCount(0)
  const finite = expiry > 0n && expiry < 253402300799n
  if (finite) {
    // The UI renders local dates. Compare using this browser's timezone, including in manually created cross-app contexts.
    const date = await page.evaluate(
      (seconds) =>
        new Date(seconds * 1000).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      Number(expiry),
    )
    await expect(page.locator('main')).toContainText(date)
  } else {
    await expect(page.locator('main')).not.toContainText(
      /Error|could not be loaded/i,
    )
    await expect(page.locator('main')).not.toContainText('Expires')
  }
}
export async function checkMigratedDates({
  name,
  root,
  manager,
  explorer,
  shot,
}: {
  name: string
  root: string
  manager: AppSession
  explorer: AppSession
  shot: (page: Page, stage: string) => Promise<void>
}) {
  await checkExpiry(explorer.page, name)
  await shot(explorer.page, 'dates')
  if (name !== root) {
    await checkExpiry(explorer.page, name.split('.').slice(1).join('.'))
    await shot(explorer.page, 'parent-dates')
    return {
      status: 'PASS WITH WORKAROUND',
      detail:
        'Child expiry verified on chain; parent expiry verified by parent navigation. No subname reminder expected.',
    }
  }
  const reminder = await explorer.page
    .getByRole('button', { name: /reminder/i })
    .count()
  await manager.page.goto(`${MANAGER_APP_URL}/${name}`)
  await expect(manager.page.locator('main')).toBeVisible()
  const renew = manager.page.getByRole('link', { name: /renew name/i })
  await expect(renew).toBeVisible()
  await renew.click()
  await expect(manager.page.locator('main')).toContainText(
    /renew|duration|year/i,
  )
  await shot(manager.page, 'renewal-entry')
  expect(
    reminder,
    'Legacy root reminder control must be available',
  ).toBeGreaterThan(0)
  return {
    status: 'PASS WITH WORKAROUND',
    detail:
      'Expiry, reminder and Manager renewal entry verified. No renewal transaction or reminder delivery claimed.',
  }
}
