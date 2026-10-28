/**
 * Upgrading a V1 name whose resolver answers only through CCIP-Read.
 *
 * An unknown resolver is classified `keep-v1` (packages/migration
 * `resolverStrategyFor`), so the V2 name should point at the same resolver
 * and nothing should be read from it or replayed. Its wildcard subname has no
 * registry entry for the migration to see; after the upgrade it should still
 * resolve through the parent's resolver.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getRecords } from '@ensdomains/ensjs/public'
import { parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  OFFCHAIN_RECORDS,
  OFFCHAIN_SUBNAME_RECORDS,
} from '../../../fixtures/offchainName.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  confirmAndAuthorize,
  openMigrationFlow,
  rootRow,
  selectOnlyRoots,
} from '../../../helpers/migration-flow.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const V2_ETH_REGISTRY =
  ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address
const V2_REGISTRY_ABI = parseAbi([
  'function getResolver(string label) view returns (address)',
])

const resolvedRecords = async (name: string) => {
  const { texts, coins } = await getRecords(publicClient as never, {
    name,
    texts: ['description'],
    coins: ['eth'],
  })
  return {
    description: texts.find((t) => t.key === 'description')?.value,
    eth: coins[0]?.value,
  }
}

test.describe('ENS V1 → V2 migration — offchain resolver', () => {
  test.describe.configure({ timeout: 300_000 })

  for (const type of ['unwrapped', 'wrapped', 'locked'] as const)
    test(`a ${type} V1 name on a CCIP-Read resolver keeps it, reads nothing through the gateway, and it and its wildcard subname still resolve`, {
      tag: ['@scenario:GR14'],
    }, async ({
      migrationConnectedPage: page,
      wallet,
      accounts,
      makeOffchainName,
      ccipGateway,
    }) => {
      const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
      const { name, subname, resolver } = await makeOffchainName({
        label: `gr13-${type}`,
        type,
      })
      const label = name.replace(/\.eth$/, '')

      await serveV1Names(page, {
        ownerAddress: owner.address,
        roots: [{ kind: 'registration', label, resolver, type }],
      })
      await openMigrationFlow(page)
      await expect(rootRow(page, name)).toBeVisible({ timeout: 60_000 })
      await selectOnlyRoots(page, [name])

      ccipGateway.reset()
      await confirmAndAuthorize(page, wallet)
      expect(
        ccipGateway.requests(),
        'the upgrade itself reads nothing through the gateway',
      ).toEqual([])

      expect(
        (
          await publicClient.readContract({
            address: V2_ETH_REGISTRY,
            abi: V2_REGISTRY_ABI,
            functionName: 'getResolver',
            args: [label],
          })
        ).toLowerCase(),
        'V2 points at the same CCIP-Read resolver (keep-v1)',
      ).toBe(resolver.toLowerCase())

      expect(await resolvedRecords(name)).toEqual({
        description: OFFCHAIN_RECORDS.texts.description,
        eth: OFFCHAIN_RECORDS.coins[60],
      })
      expect(
        await resolvedRecords(subname),
        'the wildcard subname resolves through the migrated parent',
      ).toEqual({
        description: OFFCHAIN_SUBNAME_RECORDS.texts.description,
        eth: OFFCHAIN_SUBNAME_RECORDS.coins[60],
      })

      await page.goto(`${MANAGER_APP_URL}/${name}`)
      await expect(
        page.getByText(OFFCHAIN_RECORDS.texts.description),
      ).toBeVisible({ timeout: 60_000 })
      await page.goto(`${MANAGER_APP_URL}/${subname}`)
      await expect(
        page.getByText(OFFCHAIN_SUBNAME_RECORDS.texts.description),
      ).toBeVisible({ timeout: 60_000 })

      // The explorer reads the migrated name and its subname the same way.
      for (const [shown, description] of [
        [name, OFFCHAIN_RECORDS.texts.description],
        [subname, OFFCHAIN_SUBNAME_RECORDS.texts.description],
      ] as const) {
        await page.goto(`${PORTAL_APP_URL}/${shown}`)
        await expect(page.getByText(description)).toBeVisible({
          timeout: 60_000,
        })
        await expect(page.getByText('Name not found')).toHaveCount(0)
      }
      await page.goto(`${PORTAL_APP_URL}/${name}`)
      await expect(page.getByText('ENSv2').first()).toBeVisible({
        timeout: 60_000,
      })
    })
})
