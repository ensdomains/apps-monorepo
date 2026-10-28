import type { Address, Hex, PublicClient } from 'viem'
import {
  createClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  encodeErrorResult,
  getAddress,
  namehash,
  parseAbi,
  toFunctionSelector,
  toHex,
} from 'viem'
import { packetToBytes } from 'viem/ens'
import { describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import {
  encodeResolverRecordsCall,
  getResolverSetterKind,
  isOffchainName,
  isOffchainResolver,
} from './resolverRecordCalls'

const RESOLVER = '0x3333333333333333333333333333333333333333' as Address
const OWNER = getAddress('0x1111111111111111111111111111111111111111')
const NAME = 'leon.eth'

const multicallAbi = parseAbi(['function multicall(bytes[] data)'])
const selector = (data: Hex | undefined) => data?.slice(0, 10)

/** A client whose `supportsInterface` multicall returns one result. */
const clientAnswering = (
  result: { status: 'success'; result: boolean } | { status: 'failure' },
) =>
  ({
    multicall: vi.fn(async () => [result]),
  }) as unknown as PublicClient

describe('getResolverSetterKind', () => {
  it('reads name-based setters from IAddressSetter support', async () => {
    const client = clientAnswering({ status: 'success', result: true })
    await expect(getResolverSetterKind(client, RESOLVER)).resolves.toBe('name')
    expect(client.multicall).toHaveBeenCalledWith(
      expect.objectContaining({
        contracts: [
          expect.objectContaining({
            address: RESOLVER,
            functionName: 'supportsInterface',
            args: [toFunctionSelector('setAddress(bytes,uint256,bytes)')],
          }),
        ],
      }),
    )
  })

  // PublicResolverV2 and the V1 PublicResolver both answer `false`.
  it('treats a resolver without IAddressSetter as node-based', async () => {
    await expect(
      getResolverSetterKind(
        clientAnswering({ status: 'success', result: false }),
        RESOLVER,
      ),
    ).resolves.toBe('node')
  })

  it('treats a resolver that does not answer ERC-165 as node-based', async () => {
    await expect(
      getResolverSetterKind(clientAnswering({ status: 'failure' }), RESOLVER),
    ).resolves.toBe('node')
  })

  it('surfaces an RPC failure instead of guessing', async () => {
    const client = {
      multicall: vi.fn(async () => {
        throw new Error('rpc down')
      }),
    } as unknown as PublicClient
    await expect(getResolverSetterKind(client, RESOLVER)).rejects.toThrow(
      'rpc down',
    )
  })
})

describe('isOffchainResolver', () => {
  const revert = (data?: Hex) =>
    Object.assign(new Error('execution reverted'), { code: 3, data })
  // `resolve` without CCIP: an offchain resolver reverts with OffchainLookup.
  const client = (isExtended: boolean, failure: Error) =>
    ({
      multicall: vi.fn(async () => [{ status: 'success', result: isExtended }]),
      request: vi.fn(async () => {
        throw failure
      }),
    }) as unknown as PublicClient

  it.each([
    {
      label: 'asks for an offchain lookup',
      isExtended: true,
      data: '0x556f1830ab',
      expected: true,
    },
    { label: 'reverts onchain', isExtended: true, data: '0x', expected: false },
    {
      label: 'has no extended resolution',
      isExtended: false,
      data: '0x556f1830ab',
      expected: false,
    },
  ] as const)(
    'is $expected for a resolver that $label',
    async ({ isExtended, data, expected }) => {
      await expect(
        isOffchainResolver(client(isExtended, revert(data)), RESOLVER, NAME),
      ).resolves.toBe(expected)
    },
  )

  it('fails instead of guessing when the probe itself fails', async () => {
    await expect(
      isOffchainResolver(client(true, revert()), RESOLVER, NAME),
    ).rejects.toThrow()
  })
})

describe('isOffchainName', () => {
  // `eth_call` of UniversalResolver.resolve with CCIP-Read off.
  const clientAnswering = (answer: () => Promise<unknown>) =>
    createClient({
      chain: envConfig.chain,
      transport: custom({ request: answer }),
    })
  const revert = (data: Hex) => async () => {
    throw Object.assign(new Error('execution reverted'), { code: 3, data })
  }

  it.each([
    {
      label: 'resolves through an offchain lookup',
      answer: revert('0x556f1830ab'),
      expected: true,
    },
    {
      label: 'resolves onchain',
      answer: async () =>
        encodeAbiParameters(
          [{ type: 'bytes' }, { type: 'address' }],
          [encodeAbiParameters([{ type: 'address' }], [OWNER]), RESOLVER],
        ),
      expected: false,
    },
    {
      label: 'has no resolver',
      answer: revert(
        encodeErrorResult({
          abi: parseAbi(['error ResolverNotFound(bytes name)']),
          args: [toHex(packetToBytes(NAME))],
        }),
      ),
      expected: false,
    },
  ])('is $expected for a name that $label', async ({ answer, expected }) => {
    await expect(isOffchainName(clientAnswering(answer), NAME)).resolves.toBe(
      expected,
    )
  })

  it('fails instead of guessing when the probe itself fails', async () => {
    const unreachable = async () => {
      throw new Error('fetch failed')
    }
    await expect(
      isOffchainName(clientAnswering(unreachable), NAME),
    ).rejects.toThrow()
  })
})

describe('encodeResolverRecordsCall', () => {
  it('uses the name-based setter for a PermissionedResolver', async () => {
    const data = await encodeResolverRecordsCall({
      kind: 'name',
      name: NAME,
      records: { coins: [{ coin: 60, value: OWNER }] },
    })

    expect(selector(data)).toBe(
      toFunctionSelector('setAddress(bytes,uint256,bytes)'),
    )
    const { args } = decodeFunctionData({
      abi: parseAbi([
        'function setAddress(bytes name, uint256 coinType, bytes addressBytes)',
      ]),
      data,
    })
    expect(args[0]).toBe(toHex(packetToBytes(NAME)))
    expect(args[1]).toBe(60n)
  })

  it('uses the node-based setter for public and legacy resolvers', async () => {
    const data = await encodeResolverRecordsCall({
      kind: 'node',
      name: NAME,
      records: { coins: [{ coin: 60, value: OWNER }] },
    })

    expect(selector(data)).toBe(
      toFunctionSelector('setAddr(bytes32,uint256,bytes)'),
    )
    const { args } = decodeFunctionData({
      abi: parseAbi([
        'function setAddr(bytes32 node, uint256 coinType, bytes a)',
      ]),
      data,
    })
    expect(args[0]).toBe(namehash(NAME))
    expect(args[2]).toBe(OWNER.toLowerCase())
  })

  it('clears a name-based resolver by unlinking the name first', async () => {
    const data = await encodeResolverRecordsCall({
      kind: 'name',
      name: NAME,
      records: {
        clearRecords: true,
        texts: [{ key: 'avatar', value: 'new' }],
      },
    })

    const { args } = decodeFunctionData({ abi: multicallAbi, data })
    expect(args[0].map(selector)).toEqual([
      toFunctionSelector('linkToRecord(bytes,uint256)'),
      toFunctionSelector('setText(bytes,string,string)'),
    ])
  })

  it('clears a node-based resolver with clearRecords(node) first', async () => {
    const data = await encodeResolverRecordsCall({
      kind: 'node',
      name: NAME,
      records: {
        clearRecords: true,
        texts: [{ key: 'avatar', value: 'new' }],
      },
    })

    const { args } = decodeFunctionData({ abi: multicallAbi, data })
    expect(args[0].map(selector)).toEqual([
      toFunctionSelector('clearRecords(bytes32)'),
      toFunctionSelector('setText(bytes32,string,string)'),
    ])
  })

  it('refuses an empty update', async () => {
    await expect(
      encodeResolverRecordsCall({ kind: 'node', name: NAME, records: {} }),
    ).rejects.toThrow('No resolver record changes to apply')
  })
})
