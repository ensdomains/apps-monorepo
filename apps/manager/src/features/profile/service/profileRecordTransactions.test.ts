import type { Address, PublicClient } from 'viem'
import { decodeFunctionData, parseAbi, toFunctionSelector } from 'viem'
import { describe, expect, it } from 'vitest'
import { buildRecordsUpdateCalls } from './profileRecordTransactions'

const RESOLVER = '0x3333333333333333333333333333333333333333' as Address
const multicallAbi = parseAbi(['function multicall(bytes[] data)'])

/** Answers the resolver's `supportsInterface(IAddressSetter)` probe. */
const clientFor = (supportsNameSetters: boolean) =>
  ({
    multicall: async () => [{ status: 'success', result: supportsNameSetters }],
  }) as unknown as PublicClient

/** A V2 PermissionedResolver. */
const publicClient = clientFor(true)

describe('buildRecordsUpdateCalls', () => {
  it('unlinks the name before applying the current record diff', async () => {
    const { calls } = await buildRecordsUpdateCalls({
      name: 'leon.eth',
      before: {
        texts: [
          { key: 'description', value: 'old description' },
          { key: 'avatar', value: 'old avatar' },
        ],
        coins: [],
      },
      after: {
        texts: [
          { key: 'description', value: 'old description' },
          { key: 'avatar', value: 'new avatar' },
        ],
        coins: [],
      },
      shouldClearRecords: true,
      publicClient,
      resolverAddress: RESOLVER,
    })

    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call).toBeDefined()
    if (!call) throw new Error('Expected one resolver call')

    const decoded = decodeFunctionData({
      abi: multicallAbi,
      data: call.data,
    })
    expect(decoded.functionName).toBe('multicall')

    // The V2 resolver has no `clearRecords`: unlinking drops the name to the
    // default record, and the setter that follows allocates it a fresh one.
    const nestedCalls = decoded.args[0]
    expect(nestedCalls).toHaveLength(2)
    expect(nestedCalls[0]?.slice(0, 10)).toBe(
      toFunctionSelector('linkToRecord(bytes,uint256)'),
    )
    expect(nestedCalls[1]?.slice(0, 10)).toBe(
      toFunctionSelector('setText(bytes,string,string)'),
    )
  })

  it('sends a lone setter directly when nothing is being cleared', async () => {
    const { calls } = await buildRecordsUpdateCalls({
      name: 'leon.eth',
      before: { texts: [{ key: 'avatar', value: 'old' }], coins: [] },
      after: { texts: [{ key: 'avatar', value: 'new' }], coins: [] },
      publicClient,
      resolverAddress: RESOLVER,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.data.slice(0, 10)).toBe(
      toFunctionSelector('setText(bytes,string,string)'),
    )
  })

  // PublicResolverV2 (migration's default resolver) and V1 resolvers only have
  // node-based setters, and revert on the name-based ones.
  it('writes node-based setters to a public or legacy resolver', async () => {
    const { calls } = await buildRecordsUpdateCalls({
      name: 'leon.eth',
      before: { texts: [{ key: 'avatar', value: 'old' }], coins: [] },
      after: {
        texts: [{ key: 'avatar', value: 'new' }],
        coins: [
          { coinType: 60, value: '0x1111111111111111111111111111111111111111' },
        ],
      },
      publicClient: clientFor(false),
      resolverAddress: RESOLVER,
    })

    expect(calls).toEqual([
      expect.objectContaining({ to: RESOLVER, value: 0n }),
    ])
    const decoded = decodeFunctionData({
      abi: multicallAbi,
      data: calls[0]?.data ?? '0x',
    })
    expect(decoded.args[0].map((call) => call.slice(0, 10))).toEqual([
      toFunctionSelector('setText(bytes32,string,string)'),
      toFunctionSelector('setAddr(bytes32,uint256,bytes)'),
    ])
  })
})
