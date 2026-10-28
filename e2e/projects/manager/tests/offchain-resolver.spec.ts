/**
 * Offchain (CCIP-Read) profiles in the manager — #1571 / #1575.
 *
 * The resolver answers only through `OffchainLookup`, and the gateway is the
 * local one in `helpers/ccip-gateway.ts`, so each test chooses what the
 * provider does: answer, reject a batch URL for its length (Namespace returns
 * a 500 above ~4k chars), rate limit, or fail single keys.
 */
import { expect, type Page } from '@playwright/test'
import { test } from '../../../fixtures/playwright.manager.fixture.js'
import {
  type CcipGateway,
  keysPerRequest,
} from '../../../helpers/ccip-gateway.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'

const openProfile = async (page: Page, name: string) => {
  await page.goto(`${MANAGER_APP_URL}/${name}`)
  await expect(page).toHaveURL(new RegExp(`/${name.replaceAll('.', '\\.')}$`))
}

/**
 * Before #1571 a profile load sent one gateway request per record, and the
 * manager probes ~190 keys for a name bigname has no inventory for.
 */
const expectBatchedReads = (gateway: CcipGateway) => {
  const requests = gateway.requests()
  expect(requests.filter((request) => !request.isBatch)).toEqual([])
  expect(keysPerRequest(requests)).toBeGreaterThanOrEqual(4)
}

test.describe('Offchain resolver profile', () => {
  test('reads an offchain name in batched gateway requests', {
    tag: ['@scenario:H12'],
  }, async ({ page, makeOffchainName, ccipGateway }) => {
    const { name } = await makeOffchainName()
    ccipGateway.reset()

    await openProfile(page, name)
    await expect(page.getByText('Resolved through CCIP-Read')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('offchain-e2e').first()).toBeVisible()

    expectBatchedReads(ccipGateway)
  })

  test('shows an ownerless wildcard subname from its records', {
    tag: ['@scenario:H13'],
  }, async ({ page, makeOffchainName }) => {
    const { subname } = await makeOffchainName()

    await openProfile(page, subname)
    await expect(
      page.getByText('Wildcard subname with no registry entry'),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("doesn't exist")).toHaveCount(0)
  })

  test('falls back to single reads when the gateway rejects a long batch URL', {
    tag: ['@scenario:H14'],
  }, async ({ page, makeOffchainName, ccipGateway }) => {
    const { name } = await makeOffchainName()
    ccipGateway.reset()
    ccipGateway.configure({ maxUrlLength: 4_000 })

    await openProfile(page, name)
    await expect(page.getByText('Resolved through CCIP-Read')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('offchain-e2e').first()).toBeVisible()

    const requests = ccipGateway.requests()
    expect(requests.some((r) => r.isBatch && r.status === 500)).toBe(true)
    expect(requests.some((r) => !r.isBatch && r.status === 200)).toBe(true)
  })

  test('keeps the records the gateway returned when some keys fail', {
    tag: ['@scenario:H15'],
  }, async ({ page, makeOffchainName, ccipGateway }) => {
    const { name } = await makeOffchainName()
    ccipGateway.configure({ failKeys: ['com.github'] })

    await openProfile(page, name)
    await expect(page.getByText('Resolved through CCIP-Read')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('offchain_e2e').first()).toBeVisible()
    await expect(page.getByText('offchain-e2e')).toHaveCount(0)
  })

  test('stops on a rate limit, pauses editing and recovers on retry', {
    tag: ['@scenario:H16'],
  }, async ({ page, makeOffchainName, ccipGateway }) => {
    const { name } = await makeOffchainName()
    ccipGateway.reset()
    ccipGateway.configure({ status: 429 })

    await openProfile(page, name)
    await expect(
      page.getByText(/Couldn.t load this name.s records/),
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: 'Edit Profile' }),
    ).toHaveCount(0)
    // A 429 is final: no per-record fallback and no query retry.
    expect(ccipGateway.requests().length).toBeLessThanOrEqual(4)

    ccipGateway.reset()
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText('Resolved through CCIP-Read')).toBeVisible({
      timeout: 30_000,
    })
  })
})
