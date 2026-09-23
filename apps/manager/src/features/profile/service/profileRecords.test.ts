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
  graphqlRequest: vi.fn(),
}))

vi.mock('@ens-apps/indexer/urql', () => ({
  default: {},
  graphqlRequest: mocks.graphqlRequest,
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

describe('profile records with bounded coin decoding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.graphqlRequest.mockResolvedValue({ domain: { resolver: null } })
    mocks.getRecords.mockResolvedValue({
      texts: [{ key: 'theme', value: '#123456' }],
      contentHash: { protocolType: 'ipfs', decoded: 'example' },
      abi: { abi: [] },
      resolverAddress,
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
      texts: ['avatar', 'theme'],
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
