import { getRecords } from '@ensdomains/ensjs/public'
import { multicallSnippet } from '@ensdomains/ensjs-abi/multicall'
import { universalResolverResolveSnippet } from '@ensdomains/ensjs-abi/universalResolver'
import { publicResolverTextSnippet } from '@ensdomains/ensjs-abi/v1/publicResolver'
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  type Hex,
  multicall3Abi,
  offchainLookupAbiItem,
  RawContractError,
  toHex,
} from 'viem'
import { packetToBytes } from 'viem/ens'
import { describe, expect, it, vi } from 'vitest'
import { sepoliaWithEns } from '@/lib/wagmi'
import { createNameRowRecordsClient } from './nameRowRecordsClient'

const resolver = '0x1111111111111111111111111111111111111111' as const
const universalResolver = sepoliaWithEns.contracts.ensUniversalResolver.address
const multicall3 = sepoliaWithEns.contracts.multicall3.address
const nameByPacket = new Map([
  [toHex(packetToBytes('ordinary.eth')), 'ordinary.eth'],
  [toHex(packetToBytes('sub.wildcard.eth')), 'sub.wildcard.eth'],
  [toHex(packetToBytes('ccip.eth')), 'ccip.eth'],
])

const textValues: Record<string, Record<string, string>> = {
  'ordinary.eth': { avatar: 'ipfs://ordinary' },
  'sub.wildcard.eth': { theme: '#aabbcc' },
  'ccip.eth': { avatar: 'https://example.test/ccip-avatar' },
}

const resolvedRecords = (data: Hex) => {
  const resolve = decodeFunctionData({
    abi: universalResolverResolveSnippet,
    data,
  })
  const [packet, resolverData] = resolve.args
  const name = nameByPacket.get(packet)
  if (!name) throw new Error(`Unexpected name packet: ${packet}`)

  const textCalls = decodeFunctionData({
    abi: multicallSnippet,
    data: resolverData,
  }).args[0]
  const textResults = textCalls.map((textCall) => {
    const key = decodeFunctionData({
      abi: publicResolverTextSnippet,
      data: textCall,
    }).args[1]
    return encodeFunctionResult({
      abi: publicResolverTextSnippet,
      functionName: 'text',
      result: textValues[name]?.[key] ?? '',
    })
  })
  const nested = encodeFunctionResult({
    abi: multicallSnippet,
    functionName: 'multicall',
    result: textResults,
  })
  return encodeFunctionResult({
    abi: universalResolverResolveSnippet,
    functionName: 'resolve',
    result: [nested, resolver],
  })
}

const offchainLookup = encodeErrorResult({
  abi: [offchainLookupAbiItem],
  errorName: 'OffchainLookup',
  args: [
    universalResolver,
    ['https://example.test/gateway'],
    '0x01',
    '0x12345678',
    '0x',
  ],
})

describe('name row resolver batching', () => {
  it('batches ordinary and wildcard reads, while CCIP falls back to an individual read', async () => {
    const batchedRequests = vi.fn(
      async ({ method, params }: { method: string; params?: unknown }) => {
        if (method !== 'eth_call')
          throw new Error(`Unexpected RPC method: ${method}`)
        const [{ to, data }] = params as [{ to: string; data: Hex }]
        if (to.toLowerCase() !== multicall3.toLowerCase()) {
          throw new Error(`Unexpected batch target: ${to}`)
        }

        const decoded = decodeFunctionData({ abi: multicall3Abi, data })
        if (decoded.functionName !== 'aggregate3') {
          throw new Error(
            `Unexpected multicall function: ${decoded.functionName}`,
          )
        }
        const calls = decoded.args[0]
        return encodeFunctionResult({
          abi: multicall3Abi,
          functionName: 'aggregate3',
          result: calls.map(({ target, callData }) => {
            expect(target.toLowerCase()).toBe(universalResolver.toLowerCase())
            const packet = decodeFunctionData({
              abi: universalResolverResolveSnippet,
              data: callData,
            }).args[0]
            const isCcip = nameByPacket.get(packet) === 'ccip.eth'
            return {
              success: !isCcip,
              returnData: isCcip ? offchainLookup : resolvedRecords(callData),
            }
          }),
        })
      },
    )
    const batchClient = createNameRowRecordsClient(
      custom({ request: batchedRequests }),
    )

    const names = ['ordinary.eth', 'sub.wildcard.eth', 'ccip.eth'] as const
    const [ordinary, wildcard, ccip] = await Promise.allSettled(
      names.map((name) =>
        getRecords(batchClient, { name, texts: ['avatar', 'theme'] as const }),
      ),
    )

    expect(batchedRequests).toHaveBeenCalledTimes(1)
    expect(ordinary).toMatchObject({
      status: 'fulfilled',
      value: { texts: [{ key: 'avatar', value: 'ipfs://ordinary' }] },
    })
    expect(wildcard).toMatchObject({
      status: 'fulfilled',
      value: { texts: [{ key: 'theme', value: '#aabbcc' }] },
    })
    expect(ccip?.status).toBe('rejected')

    let ccipResolveData: Hex | undefined
    const directRequests = vi.fn(
      async ({ method, params }: { method: string; params?: unknown }) => {
        if (method !== 'eth_call')
          throw new Error(`Unexpected RPC method: ${method}`)
        const [{ to, data }] = params as [{ to: string; data: Hex }]
        expect(to.toLowerCase()).toBe(universalResolver.toLowerCase())
        if (data.startsWith('0x12345678')) {
          if (!ccipResolveData)
            throw new Error('Missing initial CCIP resolve call')
          return resolvedRecords(ccipResolveData)
        }
        ccipResolveData = data
        throw new RawContractError({ data: offchainLookup })
      },
    )
    const directClient = createPublicClient({
      chain: sepoliaWithEns,
      transport: custom({ request: directRequests }),
      ccipRead: { request: vi.fn(async () => '0xdeadbeef' as Hex) },
    })
    const direct = await getRecords(directClient, {
      name: 'ccip.eth',
      texts: ['avatar', 'theme'],
    })
    expect(direct.texts).toEqual([
      { key: 'avatar', value: 'https://example.test/ccip-avatar' },
    ])
    expect(directRequests).toHaveBeenCalledTimes(2)
  })
})
