import type { Address, Hex, PublicClient } from 'viem'
import {
  decodeFunctionData,
  getAddress,
  namehash,
  parseAbi,
  toFunctionSelector,
  toHex,
} from 'viem'
import { packetToBytes } from 'viem/ens'
import { describe, expect, it, vi } from 'vitest'
import {
  encodeResolverRecordsCall,
  getResolverSetterKind,
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
