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
  getVerifiedProxyImplementation,
  parseProxyDeployedAddress,
  selectContractsHoldingRoles,
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

describe('selectContractsHoldingRoles', () => {
  const REQUIRED = 0b1010n
  const A = getAddress('0xa111111111111111111111111111111111111111')
  const B = getAddress('0xb222222222222222222222222222222222222222')
  const log = (address: Address, newRoleBitmap: bigint) => ({
    address,
    args: { newRoleBitmap },
  })

  it.each([
    ['nothing for no logs', [], []],
    ['a contract granting every required role', [log(A, REQUIRED)], [A]],
    ['a contract granting more than required', [log(A, 0b1111n)], [A]],
    ['not a contract granting only some', [log(A, 0b1000n)], []],
    [
      'not a contract whose roles were later revoked',
      [log(A, REQUIRED), log(B, REQUIRED), log(A, 0n)],
      [B],
    ],
    [
      'a contract whose roles were granted again after a revoke',
      [log(A, REQUIRED), log(A, 0n), log(A, REQUIRED)],
      [A],
    ],
    [
      'each contract once, most recently changed first',
      [log(A, REQUIRED), log(B, REQUIRED), log(A, REQUIRED)],
      [A, B],
    ],
    [
      'one checksummed contract across address casing',
      [log(A, 0n), log(A.toLowerCase() as Address, REQUIRED)],
      [A],
    ],
  ])('lists %s', (_, logs, expected) => {
    expect(selectContractsHoldingRoles(logs, REQUIRED)).toEqual(expected)
  })
})

describe('getVerifiedProxyImplementation', () => {
  const FACTORY = '0xda70306c98e97ece36f997a21368e53298572991'
  const PROXY = '0x907ccb4f76ea54976c8a857ee7fbab2624058f56'
  const IMPLEMENTATION = '0x115eb53f0c60696633855f90b138178fb40b2b2c'

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
