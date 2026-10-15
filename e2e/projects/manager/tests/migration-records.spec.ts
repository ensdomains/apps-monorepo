/**
 * ENS V1 → V2 migration — what happens to a name's records (§G.GR).
 *
 * The app learns a name's record KEYS from bigname (`seen_texts`,
 * `seen_addresses`, `seen_singletons`, `seen_abis`) and reads their VALUES on
 * chain from the V1 resolver. For a name on a known public resolver it moves
 * the name to the owner's PermissionedResolver and replays what it read in one
 * `multicall` (`to-owned-permres`). For a name on any other resolver it leaves
 * the resolver as it is and replays nothing (`keep-v1`).
 *
 * The oracle throughout is the chain, read the way a client reads it: through
 * the UniversalResolver, before and after. Records are written with
 * `setV1RecordsOn`, which proves each one landed in V1 first, so a missing
 * record afterwards is the migration's doing.
 */
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Page } from '@playwright/test'
import { type Address, type Hex, keccak256, parseAbi, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  createMakeV1Name,
  V1_PUBLIC_RESOLVER,
} from '../../../fixtures/makeV1Name.js'
import { expect, test } from '../../../fixtures/playwright.manager.fixture.js'
import {
  cloneV1PublicResolver,
  setV1RecordsOn,
  type V1Records,
} from '../../../fixtures/v1-records.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { isRealBigname } from '../../../helpers/bigname-sync.js'
import {
  confirmAndAuthorize,
  openMigrationFlow,
  rootRow,
  selectOnlyRoots,
} from '../../../helpers/migration-flow.js'
import type { MockV1Records } from '../../../helpers/mock-v1-subgraph.js'
import { expectRecordsResolve } from '../../../helpers/resolve-records.js'
import { serveV1Names } from '../../../helpers/v1-names.js'

const V2_ETH_REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
  .address as Address
const V2_REGISTRY_ABI = parseAbi([
  'function getResolver(string label) view returns (address)',
])
/** Every record write a PermissionedResolver can log. */
const RECORD_EVENTS = parseAbi([
  'event AddressUpdated(uint256 indexed recordId, uint256 coinType, bytes addressBytes)',
  'event TextUpdated(uint256 indexed recordId, string indexed keyHash, string key, string value)',
  'event ABIUpdated(uint256 indexed recordId, uint256 indexed contentType)',
  'event ContenthashUpdated(uint256 indexed recordId, bytes hash)',
  'event InterfaceUpdated(uint256 indexed recordId, bytes4 indexed interfaceId, address implementer)',
])

/** An IPFS CIDv1 contenthash (ENSIP-7). */
const CONTENTHASH: Hex =
  '0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f'
const ABI_JSON = toHex(
  '[{"type":"function","name":"gr5","inputs":[],"outputs":[]}]',
)
/** A P2PKH scriptPubKey, the form ENSIP-9 stores for BTC (coin type 0). */
const BTC_SCRIPT: Hex = '0x76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac'

const labelOf = (name: string) => name.replace(/\.eth$/, '')

/** The block after the current head, uncached — the head holds our setup. */
const nextBlock = async () =>
  (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n

/** The keys bigname would list for `records`, in the mock's shape. */
const mockKeys = (records: V1Records): MockV1Records => ({
  texts: records.texts?.map((t) => ({ ...t })),
  addresses: records.addresses?.map((a) => ({
    coinType: a.coinType,
    value: a.value,
  })),
  ...(records.contenthash && { contentHash: records.contenthash }),
  ...(records.abis && {
    abiContentTypes: records.abis.map((a) => a.contentType),
  }),
})

/** The resolver the V2 registry now names for a migrated 2LD. */
const v2ResolverOf = (label: string) =>
  publicClient.readContract({
    address: V2_ETH_REGISTRY,
    abi: V2_REGISTRY_ABI,
    functionName: 'getResolver',
    args: [label],
  })

/** Every record-write event `resolver` logged since `fromBlock`. */
const recordWritesSince = (resolver: Address | undefined, fromBlock: bigint) =>
  publicClient.getLogs({
    ...(resolver && { address: resolver }),
    events: RECORD_EVENTS,
    fromBlock,
  })

/**
 * Seed an unwrapped V1 2LD carrying `records`, serve it, migrate it alone,
 * and return its full name and the block the migration started at.
 */
async function migrateWithRecords(
  page: Page,
  wallet: Parameters<typeof confirmAndAuthorize>[1],
  owner: ReturnType<typeof privateKeyToAccount>,
  label: string,
  records: V1Records,
  {
    resolver,
    beforeConfirm,
    servedKeys,
  }: {
    readonly resolver?: Address
    /** The keys the bigname mock lists, when they should differ from the chain. */
    readonly servedKeys?: MockV1Records
    /** Assertions on the selection screen, with only this name selected. */
    readonly beforeConfirm?: () => Promise<void>
  } = {},
): Promise<{ name: string; fromBlock: bigint }> {
  const name = await createMakeV1Name({ userAccount: owner })({ label })
  await setV1RecordsOn(name, owner, false, records, { resolver })
  // The V1 baseline, read the same way as the result.
  await expectRecordsResolve(name, records)

  await serveV1Names(page, {
    ownerAddress: owner.address,
    roots: [
      {
        kind: 'registration',
        label: labelOf(name),
        records: servedKeys ?? mockKeys(records),
        resolver: resolver ?? V1_PUBLIC_RESOLVER,
      },
    ],
  })
  await openMigrationFlow(page)
  await expect(rootRow(page, name)).toBeVisible({ timeout: 60_000 })
  await selectOnlyRoots(page, [name])
  await beforeConfirm?.()

  const fromBlock = await nextBlock()
  await confirmAndAuthorize(page, wallet)
  return { name, fromBlock }
}

test.describe('ENS V1 → V2 migration — records', () => {
  test.describe.configure({ timeout: 300_000 })

  test('a contenthash and an ABI are carried to the new V2 resolver byte for byte', {
    tag: ['@scenario:GR4', '@scenario:GR5'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const records: V1Records = {
      contenthash: CONTENTHASH,
      abis: [{ contentType: 1, data: ABI_JSON }],
    }
    const { name } = await migrateWithRecords(
      page,
      wallet,
      owner,
      'gr4-content',
      records,
    )

    expect(
      (await v2ResolverOf(labelOf(name))).toLowerCase(),
      'the name left the V1 resolver',
    ).not.toBe(V1_PUBLIC_RESOLVER.toLowerCase())
    await expectRecordsResolve(name, records)
  })

  test('BTC and ETH addresses and a text key outside any default list are all carried', {
    tag: ['@scenario:GR8', '@scenario:GR9'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const records: V1Records = {
      addresses: [
        { coinType: 0, value: BTC_SCRIPT },
        { coinType: 60, value: accounts.getAddress('user2') as Hex },
      ],
      texts: [
        // Not one of the profile editor's keys: the carry list must come
        // from what the name holds, not from what the UI knows how to edit.
        { key: 'com.example.gr9-custom', value: 'carried, not curated' },
        { key: 'description', value: 'GR8/GR9 control' },
      ],
    }
    const { name } = await migrateWithRecords(
      page,
      wallet,
      owner,
      'gr8-multicoin',
      records,
    )
    expect(
      (await v2ResolverOf(labelOf(name))).toLowerCase(),
      'the name left the V1 resolver',
    ).not.toBe(V1_PUBLIC_RESOLVER.toLowerCase())
    await expectRecordsResolve(name, records)
  })

  test('fifty records are all carried, none dropped where the replay is split', {
    tag: ['@scenario:GR10'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const records: V1Records = {
      texts: Array.from({ length: 46 }, (_, i) => ({
        key: `gr10.key-${String(i).padStart(2, '0')}`,
        value: `value ${i} ${'x'.repeat(i)}`,
      })),
      addresses: [
        { coinType: 0, value: BTC_SCRIPT },
        { coinType: 60, value: accounts.getAddress('user2') as Hex },
      ],
      contenthash: CONTENTHASH,
      abis: [{ contentType: 1, data: ABI_JSON }],
    }
    const { name, fromBlock } = await migrateWithRecords(
      page,
      wallet,
      owner,
      'gr10-fifty',
      records,
    )
    await expectRecordsResolve(name, records)
    const writes = await recordWritesSince(
      await v2ResolverOf(labelOf(name)),
      fromBlock,
    )
    expect(writes.length, 'one record write per record, no more').toBe(50)
  })

  test('a name with a resolver but no records moves resolver and writes nothing', {
    tag: ['@scenario:GR11'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const { name, fromBlock } = await migrateWithRecords(
      page,
      wallet,
      owner,
      'gr11-empty',
      {},
    )
    const resolver = await v2ResolverOf(labelOf(name))
    expect(
      resolver.toLowerCase(),
      'the name moved to the owner’s V2 resolver',
    ).not.toBe(V1_PUBLIC_RESOLVER.toLowerCase())
    expect(
      await recordWritesSince(resolver, fromBlock),
      'no empty profile write',
    ).toEqual([])
  })

  test('a name on a custom resolver keeps that resolver, nothing is replayed, and its records still resolve as the screen promised', {
    tag: ['@scenario:GR3', '@scenario:GR12'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const custom = await cloneV1PublicResolver()
    const records: V1Records = {
      texts: [{ key: 'description', value: 'held by a custom resolver' }],
      addresses: [{ coinType: 60, value: accounts.getAddress('user2') as Hex }],
    }
    const { name, fromBlock } = await migrateWithRecords(
      page,
      wallet,
      owner,
      'gr3-custom',
      records,
      {
        resolver: custom,
        // GR12: the screen makes one promise for every selection. For a
        // keep-v1 name it is kept by not moving the records at all, which
        // the read-back below proves.
        beforeConfirm: () =>
          expect(
            page.getByText(
              'Your names, text records, and addresses will be carried over during the upgrade',
            ),
          ).toBeVisible(),
      },
    )

    expect(
      (await v2ResolverOf(labelOf(name))).toLowerCase(),
      'V2 points at the V1 custom resolver (keep-v1)',
    ).toBe(custom.toLowerCase())
    expect(
      await recordWritesSince(undefined, fromBlock),
      'nothing was replayed anywhere',
    ).toEqual([])
    // The records were never copied, and needed not be: they still resolve,
    // from the resolver the name kept.
    await expectRecordsResolve(name, records)
  })

  test('records survive when the index has not listed their keys yet', {
    tag: ['@scenario:GR13'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    // The stale state is served by the bigname mock; a live local bigname
    // catches up in about a second and cannot be held there.
    test.skip(isRealBigname, 'needs the bigname route mock to serve stale keys')
    test.fail(
      true,
      'E2E-024: an empty key inventory is read as "no records" and the name migrates without them',
    )
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const records: V1Records = {
      texts: [
        { key: 'description', value: 'written before the index caught up' },
      ],
      addresses: [{ coinType: 60, value: accounts.getAddress('user2') as Hex }],
    }
    // On chain the records exist; the index lists the name and its resolver
    // but none of the keys — what a real bigname serves for ~1 s after the
    // block (measured, iteration 35).
    const { name } = await migrateWithRecords(
      page,
      wallet,
      owner,
      'gr13-stale-keys',
      records,
      { servedKeys: { texts: [], addresses: [] } },
    )
    await expectRecordsResolve(name, records)
  })

  test('a pubkey and an interface implementer survive migration', {
    tag: ['@scenario:GR6', '@scenario:GR7', '@scenario:GU9'],
  }, async ({ migrationConnectedPage: page, wallet, accounts }) => {
    test.fail(
      true,
      'E2E-023: pubkey and interfaceImplementer are neither read nor replayed, and nothing warns the owner',
    )
    const owner = privateKeyToAccount(accounts.getPrivateKey('user'))
    const records: V1Records = {
      pubkey: { x: keccak256(toHex('gr6-x')), y: keccak256(toHex('gr6-y')) },
      interfaces: [
        {
          interfaceId: '0x12345678',
          implementer: accounts.getAddress('user2') as Address,
        },
      ],
      // A replayed record beside them, so the name does take the replay path.
      texts: [{ key: 'description', value: 'GR6/GR7 control' }],
    }
    const { name } = await migrateWithRecords(
      page,
      wallet,
      owner,
      'gr6-pubkey',
      records,
    )
    await expectRecordsResolve(name, records)
  })
})
