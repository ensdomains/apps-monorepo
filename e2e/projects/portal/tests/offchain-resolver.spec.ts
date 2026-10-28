/**
 * Offchain (CCIP-Read) names in the explorer — #1575.
 *
 * Same fixture as the manager spec: a V1 name on `TestOffchainResolver`, with
 * the local gateway (`helpers/ccip-gateway.ts`) deciding what the provider
 * answers.
 */
import { expect } from '@playwright/test'
import { test } from '../../../fixtures/playwright.portal.fixture.js'
import { keysPerRequest } from '../../../helpers/ccip-gateway.js'

const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

test.describe('Offchain resolver name', () => {
  test('reads an offchain name and its wildcard subname in batches', {
    tag: ['@scenario:H17'],
  }, async ({ page, makeOffchainName, ccipGateway }) => {
    const { name, subname } = await makeOffchainName()

    ccipGateway.reset()
    await page.goto(`${PORTAL_APP_URL}/${name}`)
    await expect(page.getByText('Resolved through CCIP-Read')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('offchain-e2e').first()).toBeVisible()
    // Before #1575 the explorer sent one gateway request per record.
    expect(ccipGateway.requests().some((r) => r.isBatch)).toBe(true)
    expect(keysPerRequest(ccipGateway.requests())).toBeGreaterThanOrEqual(4)

    await page.goto(`${PORTAL_APP_URL}/${subname}`)
    await expect(
      page.getByText('Wildcard subname with no registry entry'),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Name not found')).toHaveCount(0)
  })

  test('falls back when the gateway rejects a long batch URL', {
    tag: ['@scenario:H18'],
  }, async ({ page, makeOffchainName, ccipGateway }) => {
    const { name } = await makeOffchainName()
    ccipGateway.reset()
    ccipGateway.configure({ maxUrlLength: 4_000 })

    await page.goto(`${PORTAL_APP_URL}/${name}`)
    await expect(page.getByText('Resolved through CCIP-Read')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('offchain-e2e').first()).toBeVisible()
    expect(
      ccipGateway.requests().some((r) => r.isBatch && r.status === 500),
    ).toBe(true)
  })

  test('reports a rate-limited ownerless name as an error, not a missing name', {
    tag: ['@scenario:H19'],
  }, async ({ page, makeOffchainName, ccipGateway }) => {
    const { subname } = await makeOffchainName()
    ccipGateway.configure({ status: 429 })

    await page.goto(`${PORTAL_APP_URL}/${subname}`)
    await expect(page.getByText('Error loading records')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('Name not found')).toHaveCount(0)
  })
})
