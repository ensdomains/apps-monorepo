import type { Address, PublicClient } from 'viem'
import { decodeFunctionData, parseAbi, toFunctionSelector } from 'viem'
import { describe, expect, it } from 'vitest'
import { buildRecordsUpdateCalls } from './profileRecordTransactions'

const RESOLVER = '0x3333333333333333333333333333333333333333' as Address
const publicClient = {} as PublicClient
const multicallAbi = parseAbi(['function multicall(bytes[] data)'])

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
})
