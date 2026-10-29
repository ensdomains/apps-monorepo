import { addEnsContracts } from '@ensdomains/ensjs'
import { ok } from 'neverthrow'
import {
  createClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionResult,
  type Hex,
  parseAbi,
  RpcRequestError,
  toFunctionSelector,
  zeroHash,
} from 'viem'
import { mainnet } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const RESOLVER = '0x77fEF66b77d6a44AeCcCCf911f9864c7b7ca392C'
const GATEWAY = 'https://gateway.test/{sender}'
const chain = addEnsContracts(mainnet)

const abi = parseAbi([
  'error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)',
  'function findResolver(bytes name) view returns (address, bytes32, uint256)',
  'function resolve(bytes name, bytes data) view returns (bytes)',
  'function multicall(bytes[] data) returns (bytes[] results)',
  'function text(bytes32 node, string key) view returns (string)',
  'function callback(bytes response, bytes extraData) view returns (bytes)',
])
const CALLBACK = toFunctionSelector('callback(bytes,bytes)')

const revert = (sender: Hex, callData: Hex) =>
  new RpcRequestError({
    body: {},
    url: 'rpc',
    error: {
      code: 3,
      message: 'execution reverted',
      data: encodeErrorResult({
        abi,
        errorName: 'OffchainLookup',
        args: [sender, [GATEWAY], callData, CALLBACK, '0x'],
      }),
    },
  })

// The resolver answers every `text` call through its gateway; the
// UniversalResolver reverts with OffchainLookup for anything but findResolver.
const request = async ({
  method,
  params,
}: {
  readonly method: string
  readonly params?: unknown
}) => {
  if (method === 'eth_chainId') return '0x1'
  if (method !== 'eth_call') throw new Error(`unexpected ${method}`)
  const [{ to, data }] = params as readonly [{ to: Hex; data: Hex }]
  if (to.toLowerCase() === RESOLVER.toLowerCase()) {
    if (data.startsWith(CALLBACK)) {
      const [response] = decodeFunctionData({ abi, data }).args as readonly [
        Hex,
        Hex,
      ]
      return response
    }
    throw revert(RESOLVER, data)
  }
  const call = decodeFunctionData({ abi, data })
  if (call.functionName === 'findResolver')
    return encodeFunctionResult({
      abi,
      functionName: 'findResolver',
      result: [RESOLVER, zeroHash, 0n],
    })
  throw revert(to, data)
}

const gateway = vi.fn(async (_url: string, init: RequestInit) => {
  const { data } = JSON.parse(String(init.body)) as { data: Hex }
  const [, inner] = decodeFunctionData({ abi, data }).args as readonly [
    Hex,
    Hex,
  ]
  const { args } = decodeFunctionData({ abi, data: inner })
  const results = (args[0] as readonly Hex[]).map((call) => {
    const [, key] = decodeFunctionData({ abi, data: call }).args as readonly [
      Hex,
      string,
    ]
    return encodeAbiParameters(
      [{ type: 'string' }],
      [key === 'description' ? 'Stay Cloaked.' : ''],
    )
  })
  const response = encodeAbiParameters(
    [{ type: 'bytes' }],
    [encodeFunctionResult({ abi, functionName: 'multicall', result: results })],
  )
  return Response.json({ data: response })
})

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () =>
    ok(createClient({ chain, transport: custom({ request }) })),
}))

const { getRecords } = await import('./useRecords')

describe('getRecords', () => {
  beforeEach(() => vi.stubGlobal('fetch', gateway))
  afterEach(() => {
    vi.unstubAllGlobals()
    gateway.mockClear()
  })

  it('reads an offchain name in one gateway request', async () => {
    const records = await getRecords({
      name: 'intelpocik.eth',
      texts: ['avatar', 'description', 'url', 'com.twitter'],
    })

    expect(records._unsafeUnwrap()).toEqual({
      texts: [{ key: 'description', value: 'Stay Cloaked.' }],
      resolverAddress: RESOLVER,
    })
    expect(gateway).toHaveBeenCalledOnce()
  })
})
