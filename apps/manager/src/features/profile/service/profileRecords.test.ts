import {
  publicResolverMultiAddrSnippet,
  publicResolverSingleAddrSnippet,
} from '@ensdomains/ensjs-abi/v1/publicResolver'
import { decodeFunctionData, encodeAbiParameters, type Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {},
  getRecords: vi.fn(),
  resolveNameData: vi.fn(),
  getNameRecords: vi.fn(),
}))

vi.mock('@/lib/bigname', () => ({
  bigname: { getNameRecords: mocks.getNameRecords },
}))
vi.mock('@ensdomains/ensjs/public', () => ({
  getRecords: mocks.getRecords,
  resolveNameData: mocks.resolveNameData,
}))
vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return { safeGetClient: () => ok(mocks.client) }
})
vi.mock('@/utils/debug-features', () => ({ isDebugProfileName: () => false }))
vi.mock('../data/records', () => ({
  addressRecords: [{ coinType: 60 }, { coinType: 121 }, { coinType: 501 }],
  alwaysProbeAddressRecords: [],
  forceFetchRecords: { always: [], whenNotIndexed: [] },
  staticTextRecords: ['avatar', 'theme'],
  textRecords: [],
}))

import { getProfileRecords } from './profileRecords'

const resolverAddress = '0x2222222222222222222222222222222222222222'
const ethAddress = '0x1111111111111111111111111111111111111111'
const bytesResult = (value: Hex) =>
  encodeAbiParameters([{ type: 'bytes' }], [value])

const inventory = (
  knownKeys: readonly string[],
  unsupportedKeys: readonly string[] = [],
) => ({
  data: {
    namespace: 'ens',
    resolver: { chain_id: 11155111, address: resolverAddress },
    records: {},
    inventory: {
      known_keys: knownKeys,
      unset_keys: [],
      unsupported_keys: unsupportedKeys,
      abi_content_types: null,
    },
  },
  meta: {},
})

describe('profile records', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getNameRecords.mockResolvedValue(null)
    mocks.getRecords.mockResolvedValue({
      texts: [{ key: 'theme', value: '#123456' }],
      contentHash: { protocolType: 'ipfs', decoded: 'example' },
      abi: { abi: [] },
      resolverAddress,
    })
  })

  it.each([
    { description: 'not indexed yet', indexedKeys: ['text:theme'] },
    {
      description: 'already indexed',
      indexedKeys: ['text:theme', 'text:links'],
    },
  ])('loads all saved links when the links key is $description', async ({
    indexedKeys,
  }) => {
    const linksRecord = {
      key: 'links',
      value: JSON.stringify([
        { name: 'Website', url: 'https://example.com' },
        { name: 'Blog', url: 'https://blog.example.com' },
      ]),
    }
    mocks.getNameRecords.mockResolvedValue(inventory(indexedKeys))
    mocks.getRecords.mockImplementationOnce(
      async (_client, { texts }: { texts: string[] }) => ({
        texts: texts.includes('links') ? [linksRecord] : [],
        resolverAddress,
      }),
    )
    mocks.resolveNameData.mockResolvedValue(null)

    const result = (await getProfileRecords('links.eth'))._unsafeUnwrap()

    expect(result.texts).toEqual([linksRecord])
    expect(mocks.getRecords).toHaveBeenCalledExactlyOnceWith(mocks.client, {
      name: 'links.eth',
      texts: ['avatar', 'theme', 'links'],
      contentHash: true,
      abi: true,
    })
  })

  it('omits an oversized ZEN record without losing other profile records', async () => {
    mocks.resolveNameData.mockResolvedValue({
      resolverAddress,
      resolvedData: [
        {
          success: true,
          returnData: encodeAbiParameters([{ type: 'address' }], [ethAddress]),
        },
        {
          success: true,
          returnData: bytesResult(`0x2089${'11'.repeat(131_072 - 2)}`),
        },
        { success: false, returnData: '0x' },
      ],
    })

    const result = (await getProfileRecords('gift.eth'))._unsafeUnwrap()

    expect(result).toMatchObject({
      texts: [{ key: 'theme', value: '#123456' }],
      coins: [{ coinType: 60, symbol: 'eth', value: ethAddress }],
      contentHash: 'ipfs://example',
      abi: '[]',
      resolverAddress,
    })
    // No untrusted coin may reach getRecords' internal, unbounded decoder.
    expect(mocks.getRecords).toHaveBeenCalledExactlyOnceWith(mocks.client, {
      name: 'gift.eth',
      texts: ['avatar', 'theme', 'links'],
      contentHash: true,
      abi: true,
    })

    const [, parameters] = mocks.resolveNameData.mock.calls[0] ?? []
    const requestedCoins = (parameters.data as Hex[]).map((data) => {
      const call = decodeFunctionData({
        abi: [
          ...publicResolverSingleAddrSnippet,
          ...publicResolverMultiAddrSnippet,
        ],
        data,
      })
      return call.args.length === 1 ? 60n : call.args[1]
    })
    expect(requestedCoins).toEqual([60n, 121n, 501n])
  })

  it('preserves a valid ZEN address and skips a malformed sibling', async () => {
    mocks.resolveNameData.mockResolvedValue({
      resolverAddress,
      resolvedData: [
        { success: true, returnData: '0x1234' },
        {
          success: true,
          returnData: bytesResult(
            '0x20897843a3fcc6ab7d02d40946360c070b13cf7b9795',
          ),
        },
      ],
    })

    expect(
      (await getProfileRecords('valid.eth'))._unsafeUnwrap().coins,
    ).toEqual([
      {
        coinType: 121,
        symbol: 'zen',
        value: 'znc3p7CFNTsz1s6CceskrTxKevQLPoDK4cK',
      },
    ])
  })

  it('returns no coins when the universal resolver has no result', async () => {
    mocks.resolveNameData.mockResolvedValue(null)
    expect(
      (await getProfileRecords('empty.eth'))._unsafeUnwrap().coins,
    ).toEqual([])
  })

  it('retains the profile error path when resolution fails', async () => {
    mocks.resolveNameData.mockRejectedValue(new Error('Resolution failed'))
    expect((await getProfileRecords('failed.eth')).isErr()).toBe(true)
  })
})

describe('profile record key discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRecords.mockResolvedValue({ texts: [], resolverAddress })
    mocks.resolveNameData.mockResolvedValue(null)
  })

  const requestedCoinTypes = () => {
    const [, parameters] = mocks.resolveNameData.mock.calls[0] ?? []
    return (parameters.data as Hex[]).map((data) => {
      const call = decodeFunctionData({
        abi: [
          ...publicResolverSingleAddrSnippet,
          ...publicResolverMultiAddrSnippet,
        ],
        data,
      })
      return call.args.length === 1 ? 60n : call.args[1]
    })
  }

  it('reads the inventory keys bigname has seen, including unsupported ones', async () => {
    mocks.getNameRecords.mockResolvedValue(
      inventory(
        ['text:url', 'addr:60', 'addr:2147483658', 'avatar', 'contenthash'],
        ['text:com.github'],
      ),
    )

    await getProfileRecords('gift.eth')

    expect(mocks.getNameRecords).toHaveBeenCalledWith('gift.eth', {
      include: ['inventory'],
    })
    expect(mocks.getRecords).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({
        texts: ['avatar', 'theme', 'links', 'url', 'com.github'],
      }),
    )
    expect(requestedCoinTypes()).toEqual([60n, 121n, 501n, 2147483658n])
  })

  it('reads only the static keys when bigname has no inventory', async () => {
    mocks.getNameRecords.mockResolvedValue({
      data: { namespace: 'ens', records: {} },
      meta: {},
    })

    await getProfileRecords('gift.eth')

    expect(mocks.getRecords).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({ texts: ['avatar', 'theme', 'links'] }),
    )
  })

  it('returns an error when bigname fails', async () => {
    mocks.getNameRecords.mockRejectedValue(new Error('bigname down'))

    expect((await getProfileRecords('gift.eth')).isErr()).toBe(true)
  })
})
