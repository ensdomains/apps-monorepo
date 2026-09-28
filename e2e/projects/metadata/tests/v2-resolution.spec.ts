/**
 * MD3 — sepolia v2 name resolution (WEB-1191, ticket item 2: "if sepolia v2
 * names resolve and give the metadata correctly").
 *
 * Registers a name natively on the v2 ETH Registry (never touched v1) via
 * `makeV2Name`, then checks both v2 URL shapes the unified metadata route
 * accepts (`registry` and `namewrapper` — see `helpers/metadataService.ts`
 * for why both resolve the same way) against on-chain state read
 * independently.
 */
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { expect, test } from '@playwright/test'
import { type Address, parseAbi, zeroAddress } from 'viem'
import { revertTo, takeSnapshot } from '../../../fixtures/chain-snapshot.js'
import { createMakeV2Name } from '../../../fixtures/makeV2Name.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  type MetadataResponse,
  type MigrationStatusResponse,
  routes,
} from '../../../helpers/metadataService.js'
import { ETH_REGISTRY } from '../../../helpers/role-assertions.js'
import { RED_AVATAR_DATA_URI } from './testImages.js'

const REGISTRY_ABI = parseAbi([
  'function getStatus(uint256 anyId) view returns (uint8)',
  'function ownerOf(uint256 id) view returns (address)',
])
/** `PermissionedRegistry.getStatus` — 0 available, 1 reserved, 2 registered. */
const REGISTERED = 2

test.describe('MD3 — sepolia v2 name resolves metadata correctly', () => {
  test('avatar and both unified-metadata URL shapes reflect the on-chain v2 registration', {
    tag: ['@scenario:MD3'],
  }, async ({ request }) => {
    const before = await takeSnapshot()
    try {
      const makeV2Name = createMakeV2Name()
      const name = await makeV2Name({
        label: 'md3-v2-avatar',
        records: [{ key: 'avatar', value: RED_AVATAR_DATA_URI }],
      })
      const label = name.replace(/\.eth$/, '')

      // Independent oracle: read the registry directly, not the fixture's claim.
      expect(
        await publicClient.readContract({
          address: ETH_REGISTRY,
          abi: REGISTRY_ABI,
          functionName: 'getStatus',
          args: [labelToCanonicalId(label)],
        }),
        `makeV2Name returned ${name} but the v2 .eth registry does not report it registered`,
      ).toBe(REGISTERED)
      const onChainOwner = (await publicClient.readContract({
        address: ETH_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: 'ownerOf',
        args: [labelToCanonicalId(label)],
      })) as Address
      expect(onChainOwner.toLowerCase()).not.toBe(zeroAddress)

      const avatarRes = await request.get(routes.avatar('sepolia', name))
      expect(avatarRes.status()).toBe(200)
      expect(avatarRes.headers()['content-type']).toContain('image')

      for (const registryType of ['registry', 'namewrapper'] as const) {
        const metaRes = await request.get(
          routes.metadataByName('sepolia', name, registryType),
        )
        expect(
          metaRes.status(),
          `GET /sepolia/${registryType}/${name} should resolve — registryType only affects presentation`,
        ).toBe(200)
        const meta = (await metaRes.json()) as MetadataResponse
        expect(meta.name.toLowerCase()).toBe(name.toLowerCase())
        expect(meta.is_normalized).toBe(true)
      }

      const statusRes = await request.get(
        routes.migrationStatus(name, 'sepolia'),
      )
      expect(statusRes.status()).toBe(200)
      const status = (await statusRes.json()) as MigrationStatusResponse
      // Not "native": with no indexer reachable, classification runs through
      // `classifyOnChain` (src/services/metadata.ts), which — per its own
      // comment — "travels on chainMigrationStatus; never native". On-chain
      // reads alone can't distinguish "registered natively on v2" from
      // "migrated from v1" (both are just "currently on v2"), so the
      // fallback conservatively reports "migrated" for both. Telling these
      // apart requires the indexer's history, which this harness deliberately
      // doesn't provide (see docker-compose.yml). MD4 asserts the genuinely
      // migrated case, which agrees with this value either way.
      expect(
        status.status,
        'a name currently on v2 (registered natively, since the indexer is unreachable) must classify as "migrated" via the on-chain fallback',
      ).toBe('migrated')
    } finally {
      await revertTo(before)
    }
  })
})
