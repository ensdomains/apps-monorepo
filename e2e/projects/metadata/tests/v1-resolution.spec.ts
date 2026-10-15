/**
 * MD1 / MD2 — v1 name resolution (WEB-1191, ticket item 1: "if both mainnet
 * and sepolia v1 names resolve and give the metadata correctly").
 *
 * MD2 (sepolia) registers a fresh, fully-controlled V1 name via the same
 * `makeV1Name` fixture the manager/portal projects use, then checks the
 * metadata service's response against on-chain state read independently
 * (oracle hierarchy rank 1, `e2e-build-goal.md` §4).
 *
 * It does NOT set an avatar text record at registration — `makeV1Name.ts`'s
 * own top-of-file comment documents a known, already-diagnosed gap (iteration
 * 15/23, see `coverage/handoff.md`): the shared `V1_PUBLIC_RESOLVER`'s own
 * internal authorization is pinned to a superseded registry, so
 * `setText`/`setAddr` through it reverts unconditionally for a name
 * registered in the current canonical registry. Confirmed live against this
 * harness's fork while writing this spec (every `setText` call reverted
 * regardless of key/value). Not this ticket's fixture to fix — MD2 instead
 * asserts the avatar route's clean "no avatar set" behavior, and covers
 * avatar *content* correctness on the v2 side instead (MD3, MD5), where
 * `makeV2Name` deploys its own dedicated resolver per name and isn't affected.
 *
 * MD1 (mainnet) cannot use `makeV1Name` — it hardcodes Sepolia's ensjs
 * addresses and RPC client (`fixtures/makeV1Name.ts`, `helpers/anvil-client.ts`),
 * and building an equivalent mainnet registration fixture is out of
 * proportion to what the ticket asks for here (a basic "does mainnet
 * resolution still work" regression check, not new mainnet registration
 * coverage). Instead it reads a real, long-registered, stable name
 * (`ens.eth`) off the Mainnet fork — the point of "migrate contract
 * addresses" QA is exactly this: did the redeploy's `CONTRACTS.mainnet.*`
 * addresses in metadata-service-v2/src/config/networks.ts stay correct
 * against the *real* deployed contracts. `ens.eth` is old, renewed
 * indefinitely by the ENS DAO, and read via the legacy Registry's `owner()`
 * — which returns a sane answer whether or not the name happens to be
 * NameWrapper-wrapped, so the test does not need to assume either way.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { expect, test } from '@playwright/test'
import { keccak256, namehash, parseAbi, toHex, zeroAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { revertTo, takeSnapshot } from '../../../fixtures/chain-snapshot.js'
import {
  createMakeV1Name,
  V1_BASE_REGISTRAR,
} from '../../../fixtures/makeV1Name.js'
import { createAccounts } from '../../../fixtures/playwright.portal.fixture.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { mainnetPublicClient } from '../../../helpers/anvil-mainnet-client.js'
import {
  type MetadataResponse,
  type MigrationStatusResponse,
  routes,
} from '../../../helpers/metadataService.js'

const ERC721_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
])
const LEGACY_REGISTRY_ABI = parseAbi([
  'function owner(bytes32 node) view returns (address)',
])

const v1TokenId = (label: string) => BigInt(keccak256(toHex(label)))

test.describe('MD2 — sepolia v1 name resolves metadata correctly', () => {
  test('unified metadata and migration-status reflect the on-chain V1 registration', {
    tag: ['@scenario:MD2'],
  }, async ({ request }) => {
    const before = await takeSnapshot()
    try {
      const accounts = createAccounts()
      const makeV1Name = createMakeV1Name({
        userAccount: privateKeyToAccount(accounts.getPrivateKey('user')),
      })
      const name = await makeV1Name({ label: 'md2-v1' })
      const label = name.replace(/\.eth$/, '')

      // Independent oracle: the fixture's own return value is not proof —
      // read ownership directly off the BaseRegistrar it claims to use.
      const onChainOwner = await publicClient.readContract({
        address: V1_BASE_REGISTRAR,
        abi: ERC721_ABI,
        functionName: 'ownerOf',
        args: [v1TokenId(label)],
      })
      expect(
        onChainOwner.toLowerCase(),
        `${name} is not owned on-chain by the account makeV1Name registered it to`,
      ).toBe(accounts.getAddress('user').toLowerCase())

      // No avatar record was set (see the known-gap note above) — the
      // service must still answer cleanly, not crash.
      const avatarRes = await request.get(routes.avatar('sepolia', name))
      expect(
        avatarRes.status(),
        `GET /sepolia/avatar/${name} — a registered name with no avatar record should 404, not error`,
      ).toBe(404)

      const metaRes = await request.get(routes.metadataByName('sepolia', name))
      expect(metaRes.status()).toBe(200)
      const meta = (await metaRes.json()) as MetadataResponse
      expect(meta.name.toLowerCase()).toBe(name.toLowerCase())
      expect(meta.is_normalized).toBe(true)

      // The ticket's "~1 hour" cache figure is this exact value: the metadata
      // soft-TTL for an "unmigrated" name (src/services/metadata-cache.ts
      // getTtlConfig: softTtl=3600s, hardTtl=604800s/7d, so
      // stale-while-revalidate = 604800 - 3600 = 601200).
      expect(metaRes.headers()['cache-control']).toBe(
        'public, max-age=3600, stale-while-revalidate=601200',
      )

      const statusRes = await request.get(
        routes.migrationStatus(name, 'sepolia'),
      )
      expect(statusRes.status()).toBe(200)
      const status = (await statusRes.json()) as MigrationStatusResponse
      expect(
        status.status,
        'a freshly registered, un-migrated V1 name must classify as "unmigrated"',
      ).toBe('unmigrated')
    } finally {
      await revertTo(before)
    }
  })
})

test.describe('MD1 — mainnet v1 name resolves metadata correctly', () => {
  test('a real, long-registered mainnet name resolves via the redeployed contract addresses', {
    tag: ['@scenario:MD1'],
  }, async ({ request }) => {
    const name = 'ens.eth'
    const legacyRegistry =
      ensL1Contracts[supportedL1Chains.mainnet].ensLegacyRegistry.address

    const onChainOwner = await mainnetPublicClient.readContract({
      address: legacyRegistry,
      abi: LEGACY_REGISTRY_ABI,
      functionName: 'owner',
      args: [namehash(name)],
    })
    expect(
      onChainOwner.toLowerCase(),
      `${name} has no owner on the mainnet fork at the pinned block — the fixture's anchor name may need updating`,
    ).not.toBe(zeroAddress)

    const statusRes = await request.get(routes.migrationStatus(name, 'mainnet'))
    expect(
      statusRes.status(),
      `GET /migration-status/${name}?network=mainnet failed — the service's mainnet contract config (src/config/networks.ts) may be pointed at the wrong deployment`,
    ).toBe(200)
    const status = (await statusRes.json()) as MigrationStatusResponse
    expect(
      status.status,
      'mainnet has no v2 deployment yet, so every mainnet name must classify as "unmigrated"',
    ).toBe('unmigrated')
    if (status.owner) {
      expect(status.owner.toLowerCase()).toBe(onChainOwner.toLowerCase())
    }

    const metaRes = await request.get(routes.metadataByName('mainnet', name))
    expect(
      metaRes.status(),
      `GET /mainnet/registry/${name} failed to resolve a real, long-registered name`,
    ).toBe(200)
    const meta = (await metaRes.json()) as MetadataResponse
    expect(meta.name.toLowerCase()).toBe(name)
  })
})
