import type {
  LookupRecord,
  LookupResponse,
  RecordGroups,
} from '@ens-apps/indexer/bigname'
import { BignameError } from '@ens-apps/indexer/bigname'
import { errAsync, okAsync } from 'neverthrow'
import type { PublicClient } from 'viem'
import { namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock('@/lib/bigname', () => ({ bigname: { lookup } }))

import { fetchV1Profiles, ProfileFetchError } from './fetchV1Profiles'
import { getV1ProfileKeys, hasV1ProfileRecords } from './v1ProfileKeys'

const groups = (overrides: Partial<RecordGroups> = {}): RecordGroups => ({
  seen_addresses: [],
  addresses: {},
  seen_texts: [],
  texts: {},
  seen_abis: [],
  abis: {},
  seen_singletons: [],
  ...overrides,
})

const record = (name: string, records?: RecordGroups): LookupRecord => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: namehash(name),
  read_status: 'ok',
  ...(records && { records }),
})

const respond = (records: readonly LookupRecord[]): LookupResponse => ({
  data: records.map((row) => ({
    input: { name: row.name },
    kind: 'name',
    status: 'ok',
    record: row,
  })),
  meta: { as_of: {} },
})

describe('getV1ProfileKeys', () => {
  beforeEach(() => lookup.mockReset())

  it('reads every seen key, including ones whose indexed value is null', async () => {
    lookup.mockReturnValue(
      okAsync(
        respond([
          record(
            'alice.eth',
            groups({
              seen_texts: ['avatar', 'com.github'],
              texts: { avatar: 'ipfs://a', 'com.github': null },
              seen_addresses: ['60', '2147483658', 'bogus'],
              seen_singletons: ['contenthash', 'name'],
              seen_abis: ['1', '4'],
            }),
          ),
        ]),
      ),
    )

    const result = await getV1ProfileKeys(['alice.eth'])

    expect(lookup).toHaveBeenCalledWith({
      namespace: 'ens',
      profile: 'detail',
      inputs: [{ name: 'alice.eth' }],
    })
    expect(result._unsafeUnwrap()).toEqual([
      {
        id: namehash('alice.eth'),
        texts: ['avatar', 'com.github'],
        coinTypes: [60, 2147483658],
        hasContentHash: true,
        abiContentTypes: [1n, 4n],
      },
    ])
  })

  it('leaves out a name without an inventory so callers treat it as missing', async () => {
    lookup.mockReturnValue(
      okAsync(respond([record('alice.eth', groups()), record('bob.eth')])),
    )

    const keys = (
      await getV1ProfileKeys(['alice.eth', 'bob.eth'])
    )._unsafeUnwrap()

    expect(keys.map(({ id }) => id)).toEqual([namehash('alice.eth')])
    expect(keys.some(hasV1ProfileRecords)).toBe(false)
  })

  it('leaves out names with unavailable ABI inventories so migration fails closed', async () => {
    const { seen_abis: _, ...withoutAbis } = groups({
      abi_unsupported_reason: 'inventory_not_available',
    })
    lookup.mockReturnValue(okAsync(respond([record('alice.eth', withoutAbis)])))

    const keys = (await getV1ProfileKeys(['alice.eth']))._unsafeUnwrap()

    expect(keys).toEqual([])
    const multicall = vi.fn(async () => [])
    await expect(
      fetchV1Profiles({
        names: [
          {
            name: 'alice.eth',
            nodeHex: namehash('alice.eth'),
            v1ResolverAddress: '0x0000000000000000000000000000000000000001',
          },
        ],
        publicClient: { multicall } as unknown as PublicClient,
      }),
    ).rejects.toBeInstanceOf(ProfileFetchError)
    expect(multicall).not.toHaveBeenCalled()
  })

  it('copies enumerated ABI types beyond the four conventional encodings', async () => {
    lookup.mockReturnValue(
      okAsync(
        respond([
          record(
            'alice.eth',
            groups({
              seen_abis: [
                '16',
                '57896044618658097711785492504343953926634992332820282019728792003956564819968',
              ],
            }),
          ),
        ]),
      ),
    )
    const multicall = vi.fn(async () => [
      { status: 'success', result: [16n, '0x1234'] },
      { status: 'success', result: [1n << 255n, '0xabcd'] },
    ])

    const profiles = await fetchV1Profiles({
      names: [
        {
          name: 'alice.eth',
          nodeHex: namehash('alice.eth'),
          v1ResolverAddress: '0x0000000000000000000000000000000000000001',
        },
      ],
      publicClient: { multicall } as unknown as PublicClient,
    })

    expect(profiles.get(namehash('alice.eth'))?.abis).toEqual([
      { contentType: 16n, value: '0x1234' },
      { contentType: 1n << 255n, value: '0xabcd' },
    ])
    expect(multicall).toHaveBeenCalledWith(
      expect.objectContaining({
        contracts: [
          expect.objectContaining({
            functionName: 'ABI',
            args: [namehash('alice.eth'), 16n],
          }),
          expect.objectContaining({
            functionName: 'ABI',
            args: [namehash('alice.eth'), 1n << 255n],
          }),
        ],
      }),
    )
  })

  it('fails when bigname cannot answer', async () => {
    lookup.mockReturnValue(
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )

    const result = await getV1ProfileKeys(['alice.eth'])

    expect(result._unsafeUnwrapErr()._tag).toBe('GetV1ProfilesError')
  })
})
