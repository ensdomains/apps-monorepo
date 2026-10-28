/**
 * Upgrading a V1 parent whose REGISTERED subname answers only through
 * CCIP-Read.
 *
 * Each V1 subname shape takes its own route: a registry-only or unlocked
 * wrapped child is recreated in the parent's new subregistry (behind the
 * `migration-subname-recreation` flag), and an emancipated or locked child
 * moves with its locked parent. On every route the child keeps its own
 * resolver, so nothing is read through the gateway and the child resolves
 * from the same provider afterwards.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getRecords } from '@ensdomains/ensjs/public'
import {
  type Address,
  encodeFunctionData,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_NAME_WRAPPER,
  type V1NameType,
} from '../../../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../../../fixtures/makeV1RegistrySubname.js'
import {
  CHILD_FUSES,
  makeV1Subname,
  readWrapperExpiry,
} from '../../../fixtures/makeV1Subname.js'
import { deployOffchainResolver } from '../../../fixtures/offchainName.js'
import {
  expect,
  overrideManagerFeatureFlags,
  test,
  waitForManagerFeatureFlagOverride,
} from '../../../fixtures/playwright.manager.fixture.js'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'
import {
  openMigrationFlow,
  selectOnlyRoots,
  upgradeAndSettle,
} from '../../../helpers/migration-flow.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

const MANAGER_APP_URL = process.env.MANAGER_APP_URL ?? 'http://localhost:3000'
const PORTAL_APP_URL = process.env.PORTAL_APP_URL ?? 'http://localhost:3001'
const V2_ETH_REGISTRY =
  ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address
const WRAPPER_ABI = parseAbi([
  'function setResolver(bytes32 node, address resolver)',
])
const V2_REGISTRY_ABI = parseAbi([
  'function getResolver(string label) view returns (address)',
  'function getSubregistry(string label) view returns (address)',
])

const CHILD_RECORDS = {
  texts: { description: 'Registered V1 subname on a CCIP-Read resolver' },
  coins: { 60: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' },
} as const
const EXPECTED = {
  description: CHILD_RECORDS.texts.description,
  eth: CHILD_RECORDS.coins[60],
}

const resolvedRecords = async (name: string) => {
  const { texts, coins } = await getRecords(publicClient as never, {
    name,
    texts: ['description'],
    coins: ['eth'],
  })
  return { description: texts[0]?.value, eth: coins[0]?.value }
}

const SHAPES = [
  { child: 'registry', parentType: 'unwrapped' },
  { child: 'UNLOCKED_CHILD', parentType: 'wrapped' },
  { child: 'EMANCIPATED', parentType: 'locked' },
  { child: 'LOCKED_CHILD', parentType: 'locked' },
] as const satisfies readonly {
  child: 'registry' | keyof typeof CHILD_FUSES
  parentType: V1NameType
}[]

test.describe('ENS V1 → V2 migration — subname on an offchain resolver', () => {
  test.describe.configure({ timeout: 300_000 })

  for (const { child: shape, parentType } of SHAPES)
    test(`a ${shape === 'registry' ? 'registry-only' : shape.toLowerCase().replace('_', ' ')} subname of a ${parentType} parent keeps its CCIP-Read resolver and still resolves`, {
      tag: ['@scenario:GR15'],
    }, async ({
      migrationConnectedPage: page,
      wallet,
      accounts,
      ccipGateway,
    }) => {
      const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
      const parent = await createMakeV1Name({ userAccount: owner })({
        label: `gr14-${parentType}`,
        type: parentType,
      })
      const parentLabel = parent.replace(/\.eth$/, '')
      const resolver = await deployOffchainResolver(ccipGateway.url, owner)

      let child: string
      if (shape === 'registry') {
        child = await makeV1RegistrySubname({
          parentName: parentLabel,
          childLabel: 'bob',
          ownerAddress: owner.address,
          parentOwnerAccount: owner,
          resolver,
        })
      } else {
        // From the chain's clock: an unlocked child needs its own expiry, and
        // the suite moves the fork ahead of the runner's.
        const { timestamp } = await publicClient.getBlock()
        child = await makeV1Subname({
          parentName: parentLabel,
          childLabel: 'bob',
          ownerAddress: owner.address,
          parentOwnerAccount: owner,
          fuses: CHILD_FUSES[shape],
          ...(shape === 'UNLOCKED_CHILD' && {
            expiry: timestamp + 180n * 24n * 3600n,
          }),
        })
        await publicClient.waitForTransactionReceipt({
          hash: await walletClient.sendTransaction({
            account: owner,
            to: V1_NAME_WRAPPER,
            data: encodeFunctionData({
              abi: WRAPPER_ABI,
              functionName: 'setResolver',
              args: [namehash(child), resolver],
            }),
          }),
        })
      }
      ccipGateway.setRecords(child, CHILD_RECORDS)
      expect(await resolvedRecords(child), 'V1 baseline').toEqual(EXPECTED)

      await serveV1Names(page, {
        ownerAddress: owner.address,
        roots: [
          {
            kind: 'registration',
            label: parentLabel,
            type: parentType,
            ...(parentType !== 'unwrapped' && {
              wrapperExpiry: Number(await readWrapperExpiry(parent)),
            }),
            children: [
              shape === 'registry'
                ? { kind: 'registry-child', label: 'bob' }
                : {
                    kind: 'wrapped-child',
                    label: 'bob',
                    fuses: CHILD_FUSES[shape],
                  },
            ],
          },
        ],
      })
      await overrideManagerFeatureFlags(page, {
        migration: true,
        'migration-subname-recreation': true,
      })
      await openMigrationFlow(page)
      await waitForManagerFeatureFlagOverride(page)
      await selectOnlyRoots(page, [parent])
      ccipGateway.reset()
      // upgradeAndSettle also confirms the app's refreshed "Your subnames are
      // unaffected" review, which a copied child can raise.
      expect(await upgradeAndSettle(page, wallet)).toBe('success')
      expect(
        ccipGateway.requests(),
        'the upgrade reads nothing through the gateway',
      ).toEqual([])

      const subregistry = (await publicClient.readContract({
        address: V2_ETH_REGISTRY,
        abi: V2_REGISTRY_ABI,
        functionName: 'getSubregistry',
        args: [parentLabel],
      })) as Address
      expect(subregistry, 'the parent has a V2 subregistry').not.toBe(
        zeroAddress,
      )
      expect(
        (
          await publicClient.readContract({
            address: subregistry,
            abi: V2_REGISTRY_ABI,
            functionName: 'getResolver',
            args: ['bob'],
          })
        ).toLowerCase(),
        'the V2 child keeps its CCIP-Read resolver',
      ).toBe(resolver.toLowerCase())
      expect(
        await resolvedRecords(child),
        'resolves after the upgrade',
      ).toEqual(EXPECTED)

      for (const app of [MANAGER_APP_URL, PORTAL_APP_URL]) {
        await page.goto(`${app}/${child}`)
        await expect(page.getByText(EXPECTED.description)).toBeVisible({
          timeout: 60_000,
        })
      }
    })
})
