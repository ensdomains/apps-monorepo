import {
  type Address,
  createPublicClient,
  custom,
  encodeErrorResult,
  type Hex,
  type PublicClient,
  parseAbi,
  RpcRequestError,
} from 'viem'
import { sepolia } from 'viem/chains'
import { vi } from 'vitest'

export type EthCallRequest = {
  readonly from?: Address
  readonly to: Address
  readonly data: Hex
}

const offchainLookupAbi = parseAbi([
  'error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)',
])

/** The node's response to an `eth_call` that reverted with `data`. */
export const revertWith = (data: Hex = '0x') =>
  new RpcRequestError({
    body: {},
    error: { code: 3, message: 'execution reverted', data },
    url: 'http://rpc.test',
  })

/** A revert asking the caller to fetch the answer from a gateway. */
export const offchainLookupRevert = (sender: Address) =>
  revertWith(
    encodeErrorResult({
      abi: offchainLookupAbi,
      errorName: 'OffchainLookup',
      args: [
        sender,
        ['https://gateway.test/{sender}/{data}.json'],
        '0x',
        '0x00000000',
        '0x',
      ],
    }),
  )

/** A CCIP-Read gateway that records requests and never answers. */
export const unreachableGateway = () =>
  vi.fn(async (): Promise<Hex> => {
    throw new Error('gateway.test is unreachable')
  })

/** A public client whose `eth_call`s are answered by `ethCall`, with gateway requests recorded on `gateway`. */
export const createEthCallClient = (
  ethCall: (request: EthCallRequest) => Promise<Hex>,
  gateway = unreachableGateway(),
) => {
  const client = createPublicClient({
    chain: sepolia,
    ccipRead: { request: gateway },
    transport: custom(
      {
        request: async ({ method, params }) => {
          if (method === 'eth_call') return ethCall(params[0])
          throw new Error(`unexpected ${method}`)
        },
      },
      { retryCount: 0 },
    ),
  }) as PublicClient
  return { client, gateway }
}
