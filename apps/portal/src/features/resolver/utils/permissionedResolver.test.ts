import {
  type Address,
  createClient,
  custom,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  type Hex,
  parseAbi,
  parseAbiParameters,
  RpcRequestError,
} from 'viem'
import { describe, expect, it } from 'vitest'
import {
  decodeImplementationAddress,
  filterPermissionedResolverAddresses,
  getVerifiedProxyImplementation,
  type ProxyDeployedLog,
  parseProxyDeployedAddress,
} from './permissionedResolver'

describe('decodeImplementationAddress', () => {
  it('returns null for null/undefined input', () => {
    expect(decodeImplementationAddress(null)).toBeNull()
    expect(decodeImplementationAddress(undefined)).toBeNull()
  })

  it('returns null for empty hex', () => {
    expect(decodeImplementationAddress('0x')).toBeNull()
  })

  it('returns null for zero-padded storage', () => {
    expect(
      decodeImplementationAddress(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ),
    ).toBeNull()
  })

  it('decodes a valid address from 32-byte storage slot', () => {
    const address = '0x1234567890abcdef1234567890abcdef12345678'
    const storageValue = `0x000000000000000000000000${address.slice(2)}` as Hex

    const result = decodeImplementationAddress(storageValue)
    expect(result?.toLowerCase()).toBe(address.toLowerCase())
  })

  it('returns null for invalid address data', () => {
    expect(decodeImplementationAddress('0xinvalid' as Hex)).toBeNull()
  })
})

describe('parseProxyDeployedAddress', () => {
  it('returns null for empty logs', () => {
    expect(parseProxyDeployedAddress([])).toBeNull()
  })

  it('returns null for logs with no topics', () => {
    expect(parseProxyDeployedAddress([{ topics: [], data: '0x' }])).toBeNull()
  })
})

describe('filterPermissionedResolverAddresses', () => {
  const expectedImpl = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address

  it('returns empty array for empty logs', () => {
    expect(filterPermissionedResolverAddresses([], expectedImpl)).toEqual([])
  })

  it('filters logs by implementation address', () => {
    const logs: ProxyDeployedLog[] = [
      {
        args: {
          implementation: expectedImpl,
          proxyAddress: '0x1111111111111111111111111111111111111111' as Address,
        },
      },
      {
        args: {
          implementation:
            '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' as Address,
          proxyAddress: '0x2222222222222222222222222222222222222222' as Address,
        },
      },
    ]

    const result = filterPermissionedResolverAddresses(logs, expectedImpl)
    expect(result).toHaveLength(1)
    expect(result[0]?.toLowerCase()).toBe(
      '0x1111111111111111111111111111111111111111',
    )
  })

  it('deduplicates addresses (case-insensitive)', () => {
    const proxy = '0x1111111111111111111111111111111111111111' as Address
    const logs: ProxyDeployedLog[] = [
      { args: { implementation: expectedImpl, proxyAddress: proxy } },
      { args: { implementation: expectedImpl, proxyAddress: proxy } },
    ]

    const result = filterPermissionedResolverAddresses(logs, expectedImpl)
    expect(result).toHaveLength(1)
  })

  it('returns addresses in reverse log order (most recent first)', () => {
    const logs: ProxyDeployedLog[] = [
      {
        args: {
          implementation: expectedImpl,
          proxyAddress: '0x1111111111111111111111111111111111111111' as Address,
        },
      },
      {
        args: {
          implementation: expectedImpl,
          proxyAddress: '0x2222222222222222222222222222222222222222' as Address,
        },
      },
    ]

    const result = filterPermissionedResolverAddresses(logs, expectedImpl)
    expect(result).toHaveLength(2)
    expect(result[0]?.toLowerCase()).toBe(
      '0x2222222222222222222222222222222222222222',
    )
    expect(result[1]?.toLowerCase()).toBe(
      '0x1111111111111111111111111111111111111111',
    )
  })
})

describe('getVerifiedProxyImplementation', () => {
  const FACTORY = '0x9e726eb570beb6bceb495ab8cda7df517d4e841c' as Address
  const PROXY = '0x907ccb4f76ea54976c8a857ee7fbab2624058f56' as Address
  const IMPLEMENTATION = '0x14f09fd05d4585759e54844dc9b00147131cf243' as Address

  const clientAnswering = (
    respond: (calldata: Hex) => Promise<Hex>,
    onCall?: (request: { to: Address; data: Hex }) => void,
  ) =>
    createClient({
      transport: custom({
        request: async ({ method, params }) => {
          if (method !== 'eth_call') throw new Error(`unexpected ${method}`)
          const [request] = params as [{ to: Address; data: Hex }]
          onCall?.(request)
          return respond(request.data)
        },
      }),
    })

  // The deployed factory answers with the implementation the proxy currently
  // delegates to, not a boolean.
  it('returns the implementation the factory reports', async () => {
    let seen: { to: Address; data: Hex } | undefined
    const client = clientAnswering(
      async () =>
        encodeAbiParameters(parseAbiParameters('address'), [IMPLEMENTATION]),
      (request) => {
        seen = request
      },
    )

    await expect(
      getVerifiedProxyImplementation({
        client,
        factoryAddress: FACTORY,
        proxyAddress: PROXY,
      }),
    ).resolves.toBe(getAddress(IMPLEMENTATION))
    expect(seen?.to).toBe(FACTORY)
    expect(seen?.data).toBe(
      encodeFunctionData({
        abi: parseAbi([
          'function verifyContract(address proxy) view returns (address)',
        ]),
        args: [PROXY],
      }),
    )
  })

  // The factory reverts for a proxy it did not deploy, which is an answer.
  it('treats a reverted verification as no implementation', async () => {
    const client = clientAnswering(async () => {
      throw new RpcRequestError({
        body: {},
        error: {
          code: 3,
          message: 'execution reverted',
          // ProxyNotFromFactory(address)
          data: `0x4c87e2b6${'0'.repeat(64)}`,
        },
        url: 'http://localhost',
      })
    })

    await expect(
      getVerifiedProxyImplementation({
        client,
        factoryAddress: FACTORY,
        proxyAddress: PROXY,
      }),
    ).resolves.toBeNull()
  })

  // Guards the whole point of isRevert: a mutation making it always true would
  // otherwise pass, putting back the behaviour where a blip costs a genuine
  // proxy its badge.
  it('surfaces a transport failure instead of answering', async () => {
    const client = clientAnswering(async () => {
      throw new Error('fetch failed')
    })

    await expect(
      getVerifiedProxyImplementation({
        client,
        factoryAddress: FACTORY,
        proxyAddress: PROXY,
      }),
    ).rejects.toThrow()
  })
})
