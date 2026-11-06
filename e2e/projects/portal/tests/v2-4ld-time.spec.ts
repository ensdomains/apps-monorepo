/** Forward-only clock movement: run separately, after action suites. */
import { getOwner } from '@ensdomains/ensjs/public/v2'
import { labelhash, parseAbi, zeroAddress } from 'viem'
import { makeV2FourLD } from '../../../fixtures/makeV2FourLD.js'
import {
  connectWithHeadlessWallet,
  expect,
  test,
} from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { isRealBigname } from '../../../helpers/bigname-sync.js'

const origin = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'

test('expired native 4LD cannot transfer while its ancestors stay active', {
  tag: ['@scenario:Q59'],
}, async ({ portalPage: page, wallet, wallets, time }) => {
  test.setTimeout(300_000)
  test.skip(!isRealBigname, 'Native 4LD expiry requires real bigname')
  await connectWithHeadlessWallet(page, wallet)
  const tree = await makeV2FourLD(wallets.account('owner'), {
    leafLifetimeSeconds: 600,
  })
  const expiry = await publicClient.readContract({
    address: tree.leaf.registryAddress,
    abi: parseAbi(['function getExpiry(uint256 id) view returns (uint64)']),
    functionName: 'getExpiry',
    args: [BigInt(labelhash(tree.leaf.label))],
  })
  const remaining = expiry - (await publicClient.getBlock()).timestamp
  expect(remaining).toBeGreaterThan(0n)
  expect(remaining).toBeLessThanOrEqual(600n)
  await page.goto(`${origin}/${tree.name}/ownership/transfer`)
  await expect(page.getByPlaceholder('ENS name or address')).toBeVisible()
  await time.sync()
  await time.increaseTime({
    seconds: Number(expiry - (await publicClient.getBlock()).timestamp) + 1,
  })
  const status = await publicClient.readContract({
    address: tree.leaf.registryAddress,
    abi: parseAbi(['function getStatus(uint256 id) view returns (uint8)']),
    functionName: 'getStatus',
    args: [BigInt(labelhash(tree.leaf.label))],
  })
  // Chain first: an expired leaf is AVAILABLE (0) with no owner, not just
  // "not registered" (RESERVED, 1, would also pass a looser check).
  expect(status, 'the expired leaf is AVAILABLE').toBe(0)
  expect(await getOwner(publicClient, { name: tree.name })).toBe(zeroAddress)
  await page.reload()
  // Measured 2026-10-21: the page takes its no-owner branch for an expired
  // V2 leaf (it reads as missing rather than expired).
  await expect(
    page.getByText(
      `This subname doesn’t exist under ${tree.parent.name}, so there is nothing to transfer.`,
    ),
  ).toBeVisible({ timeout: 30_000 })
  await expect(page.getByPlaceholder('ENS name or address')).toHaveCount(0)
  expect(await getOwner(publicClient, { name: tree.parent.name })).toBe(
    wallets.address('owner'),
  )
  expect(await getOwner(publicClient, { name: tree.root })).toBe(
    wallets.address('owner'),
  )
})
