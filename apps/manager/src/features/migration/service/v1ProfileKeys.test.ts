import type { NameRecords, RecordInventory } from '@ens-apps/indexer/bigname'
import { BignameError } from '@ens-apps/indexer/bigname'
import { errAsync, okAsync } from 'neverthrow'
import type { PublicClient } from 'viem'
import { namehash, zeroHash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolverRecords, events } = vi.hoisted(() => ({
  resolverRecords: vi.fn(),
  events: vi.fn(),
}))
vi.mock('@/lib/bigname', () => ({ bigname: { resolverRecords, events } }))

import { fetchV1Profiles, ProfileFetchError } from './fetchV1Profiles'
import { getV1ProfileKeys } from './v1ProfileKeys'

const RESOLVER = '0x8fade66b79cc9f707ab26799354482eb93a5b7dd'

const source = (name: string) =>
  ({
    id: namehash(name),
    name,
    resolver: RESOLVER,
  }) as const

const inventory = (
  overrides: Partial<RecordInventory> = {},
): RecordInventory => ({
  known_keys: [],
  unset_keys: [],
  unsupported_keys: [],
  abi_content_types: [],
  ...overrides,
})

const answer = (data: Partial<NameRecords> = {}) =>
  okAsync({
    data: {
      namespace: 'ens',
      resolver: { chain_id: 11155111, address: RESOLVER },
      records: { contenthash: { status: 'not_found' } },
      inventory: inventory(),
      ...data,
    },
    meta: { as_of: {} },
  })

const recordEvents = (keys: readonly string[], nextCursor: string | null) =>
  okAsync({
    data: keys.map((key) => ({ type: 'record', data: { key } })),
    page: { next_cursor: nextCursor },
    meta: {},
  })

describe('getV1ProfileKeys', () => {
  beforeEach(() => {
    resolverRecords.mockReset()
    events.mockReset()
    events.mockReturnValue(recordEvents([], null))
  })

  it('reads known and unset keys from the source resolver', async () => {
    resolverRecords.mockReturnValue(
      answer({
        inventory: inventory({
          known_keys: [
            'text:avatar',
            'addr:60',
            'addr:2147483658',
            'contenthash',
          ],
          unset_keys: ['text:com.github', 'addr:bogus'],
          abi_content_types: ['1', '4'],
        }),
      }),
    )

    const result = await getV1ProfileKeys([source('alice.eth')])

    expect(resolverRecords).toHaveBeenCalledWith(11155111, RESOLVER, {
      name: 'alice.eth',
      include: ['inventory'],
      keys: ['contenthash'],
    })
    expect(result._unsafeUnwrap()).toEqual([
      {
        id: namehash('alice.eth'),
        texts: ['avatar', 'com.github'],
        coinTypes: [60, 2147483658],
        hasContentHash: true,
        abiContentTypes: [1n, 4n],
        interfaceIds: [],
      },
    ])
  })

  it('lists interface ids from every page of the resolver record events', async () => {
    resolverRecords.mockReturnValue(answer())
    events
      .mockReturnValueOnce(
        recordEvents(['interface:0x01FFC9A7', 'text:url'], 'page-2'),
      )
      .mockReturnValueOnce(
        recordEvents(
          ['interface:0x01ffc9a7', 'interface:0x12345678', 'name'],
          null,
        ),
      )

    const [keys] = (
      await getV1ProfileKeys([source('alice.eth')])
    )._unsafeUnwrap()

    expect(events).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'alice.eth',
        resolver: `11155111:${RESOLVER}`,
        type: ['record'],
      }),
      expect.anything(),
    )
    expect(events).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: 'page-2' }),
      expect.anything(),
    )
    expect(keys?.interfaceIds).toEqual(['0x01ffc9a7', '0x12345678'])
    expect(keys?.hasName).toBe(true)
  })

  it('counts a contenthash the answer serves even when the inventory omits it', async () => {
    resolverRecords.mockReturnValue(
      answer({ records: { contenthash: { status: 'ok', value: '0xe301' } } }),
    )

    const [keys] = (
      await getV1ProfileKeys([source('alice.eth')])
    )._unsafeUnwrap()

    expect(keys?.hasContentHash).toBe(true)
  })

  it('leaves out a name without an inventory or not indexed at the resolver', async () => {
    resolverRecords
      .mockReturnValueOnce(answer())
      .mockReturnValueOnce(answer({ inventory: undefined }))
      .mockReturnValueOnce(
        errAsync(new BignameError({ code: 'not_found', message: 'none' })),
      )

    const keys = (
      await getV1ProfileKeys([
        source('alice.eth'),
        source('bob.eth'),
        source('carol.eth'),
      ])
    )._unsafeUnwrap()

    expect(keys).toEqual([
      {
        id: namehash('alice.eth'),
        texts: [],
        coinTypes: [],
        hasContentHash: false,
        abiContentTypes: [],
        interfaceIds: [],
      },
    ])
  })

  it('leaves out names with unavailable ABI inventories so migration fails closed', async () => {
    resolverRecords.mockReturnValue(
      answer({
        inventory: inventory({
          abi_content_types: null,
          abi_unsupported_reason: 'inventory_not_available',
        }),
      }),
    )

    const keys = (await getV1ProfileKeys([source('alice.eth')]))._unsafeUnwrap()

    expect(keys).toEqual([])
    const multicall = vi.fn(async () => [])
    await expect(
      fetchV1Profiles({
        names: [
          {
            name: 'alice.eth',
            nodeHex: namehash('alice.eth'),
            v1ResolverAddress: RESOLVER,
          },
        ],
        publicClient: { multicall } as unknown as PublicClient,
      }),
    ).rejects.toBeInstanceOf(ProfileFetchError)
    expect(multicall).not.toHaveBeenCalled()
  })

  it('copies enumerated ABI types beyond the four conventional encodings', async () => {
    resolverRecords.mockReturnValue(
      answer({
        inventory: inventory({
          abi_content_types: [
            '16',
            '57896044618658097711785492504343953926634992332820282019728792003956564819968',
          ],
        }),
      }),
    )
    const multicall = vi.fn(async () => [
      { status: 'success', result: [16n, '0x1234'] },
      { status: 'success', result: [1n << 255n, '0xabcd'] },
      { status: 'success', result: [zeroHash, zeroHash] },
    ])

    const profiles = await fetchV1Profiles({
      names: [
        {
          name: 'alice.eth',
          nodeHex: namehash('alice.eth'),
          v1ResolverAddress: RESOLVER,
        },
      ],
      publicClient: { multicall } as unknown as PublicClient,
    })

    expect(profiles.get(namehash('alice.eth'))?.abis).toEqual([
      { contentType: 16n, value: '0x1234' },
      { contentType: 1n << 255n, value: '0xabcd' },
    ])
  })

  it('fails when bigname cannot answer', async () => {
    resolverRecords.mockReturnValue(
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )

    const result = await getV1ProfileKeys([source('alice.eth')])

    expect(result._unsafeUnwrapErr()._tag).toBe('GetV1ProfilesError')
  })
})
