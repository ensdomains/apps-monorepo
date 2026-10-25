import type { Address, PublicClient } from 'viem'
import { decodeFunctionData, parseAbi, toFunctionSelector } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  normalizeProfileRecords,
  transformProfileRecords,
  transformToServiceFormat,
} from '@/features/profile/utils/transformRecords'
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
  it('includes interface and binary data setters in the same clean import batch', async () => {
    const { calls } = await buildRecordsUpdateCalls({
      name: 'alice.eth',
      before: { texts: [], coins: [] },
      after: {
        texts: [],
        coins: [],
        interfaces: [{ interfaceId: '0x12345678', implementer: RESOLVER }],
        data: [{ key: 'binary', value: '0x00ff0100' }],
      },
      shouldClearRecords: true,
      publicClient,
      resolverAddress: RESOLVER,
    })
    const [call] = calls
    if (!call) throw new Error('Missing record write')
    const batch = decodeFunctionData({
      abi: multicallAbi,
      data: call.data,
    }).args[0]
    expect(batch[0]?.slice(0, 10)).toBe(
      toFunctionSelector('linkToRecord(bytes,uint256)'),
    )
    const abi = parseAbi([
      'function setInterface(bytes,bytes4,address)',
      'function setData(bytes,string,bytes)',
    ])
    expect(
      batch.slice(1).map((data) => decodeFunctionData({ abi, data })),
    ).toEqual([
      {
        functionName: 'setInterface',
        args: ['0x05616c6963650365746800', '0x12345678', RESOLVER],
      },
      {
        functionName: 'setData',
        args: ['0x05616c6963650365746800', 'binary', '0x00ff0100'],
      },
    ])
  })
  it('does not republish inherited social records when a different social record is edited', async () => {
    const saved = transformProfileRecords({
      texts: [
        { key: 'com.twitter', value: 'https://x.com/previousowner' },
        { key: 'com.discord', value: 'old-discord' },
      ],
      coins: [],
      resolverAddress: RESOLVER,
    })
    const submitted = normalizeProfileRecords({
      ...saved,
      social: saved.social.map((record) =>
        record.key === 'com.discord'
          ? { ...record, value: 'new-discord' }
          : record,
      ),
    })

    const { calls } = await buildRecordsUpdateCalls({
      name: 'transferred.eth',
      before: transformToServiceFormat(saved),
      after: transformToServiceFormat(submitted),
      shouldClearRecords: true,
      publicClient,
      resolverAddress: RESOLVER,
    })
    const decoded = decodeFunctionData({
      abi: multicallAbi,
      data: calls[0]?.data ?? '0x',
    })
    const setTextAbi = parseAbi(['function setText(bytes,string,string)'])

    expect(
      decoded.args[0].slice(1).map((data) => {
        const call = decodeFunctionData({ abi: setTextAbi, data })
        return call.args.slice(1)
      }),
    ).toEqual([['com.discord', 'new-discord']])
  })

  it('unlinks the name before applying the current record diff', async () => {
    const ethAddress = '0x1111111111111111111111111111111111111111'
    const { calls } = await buildRecordsUpdateCalls({
      name: 'leon.eth',
      before: {
        texts: [
          { key: 'description', value: 'old description' },
          { key: 'avatar', value: 'old avatar' },
        ],
        coins: [{ coinType: 60, value: ethAddress }],
      },
      after: {
        texts: [
          { key: 'description', value: 'old description' },
          { key: 'avatar', value: 'new avatar' },
        ],
        coins: [{ coinType: 60, value: ethAddress }],
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
    const setTextAbi = parseAbi(['function setText(bytes,string,string)'])
    expect(
      nestedCalls.slice(1).map((data) => {
        const call = decodeFunctionData({ abi: setTextAbi, data })
        return call.args.slice(1)
      }),
    ).toEqual([['avatar', 'new avatar']])
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
