import type { Address, PublicClient } from 'viem'
import { decodeFunctionData, parseAbi, toFunctionSelector } from 'viem'
import { describe, expect, it } from 'vitest'
import { buildRecordsUpdateCalls } from './profileRecordTransactions'

const RESOLVER = '0x3333333333333333333333333333333333333333' as Address
const publicClient = {} as PublicClient
const multicallAbi = parseAbi(['function multicall(bytes[] data)'])

describe('buildRecordsUpdateCalls', () => {
  it('clears the target node before applying the current record diff', async () => {
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
      clearRecords: true,
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

    const nestedCalls = decoded.args[0]
    expect(nestedCalls).toHaveLength(2)
    expect(nestedCalls[0]?.slice(0, 10)).toBe(
      toFunctionSelector('clearRecords(bytes32)'),
    )
    expect(nestedCalls[1]?.slice(0, 10)).toBe(
      toFunctionSelector('setText(bytes32,string,string)'),
    )
  })
})
