import { createConfig, http } from '@wagmi/core'
import {
  type Address,
  createPublicClient,
  custom,
  type Hex,
  toEventSelector,
  toHex,
  zeroHash,
} from 'viem'
import { mainnet } from 'viem/chains'
import { mock } from 'wagmi/connectors'

const config = createConfig({
  chains: [mainnet],
  connectors: [
    mock({ accounts: ['0x1111111111111111111111111111111111111111'] }),
  ],
  transports: { [mainnet.id]: http() },
})
const [connector] = config.connectors
if (!connector) throw new Error('Missing test connector')

export const SAFE_WALLET_CONNECTOR = {
  ...connector,
  type: 'walletConnect',
  getProvider: async () => ({
    session: {
      peer: {
        metadata: { name: 'Safe{Wallet}', url: 'https://app.safe.global' },
      },
    },
  }),
}

const blockQuantity = (value: unknown, fallback: bigint): bigint =>
  typeof value === 'string' && value !== 'latest' ? BigInt(value) : fallback

const getLogRange = (rpcParams: unknown, latest: bigint) => {
  const value: unknown = Array.isArray(rpcParams) ? rpcParams[0] : undefined
  const filter = typeof value === 'object' && value !== null ? value : {}
  return {
    fromBlock: 'fromBlock' in filter ? blockQuantity(filter.fromBlock, 0n) : 0n,
    toBlock:
      'toBlock' in filter ? blockQuantity(filter.toBlock, latest) : latest,
  }
}

export const createSafeExecutionPublicClient = (params: {
  readonly ownerAddress: Address
  readonly safeTxHash: Hex
  readonly executionHash: Hex
  readonly event: 'ExecutionSuccess' | 'ExecutionFailure'
  readonly latestBlockNumber?: bigint
  readonly executionBlockNumber?: bigint
  readonly hasExecution?: boolean
  readonly onLogRange?: (range: {
    readonly fromBlock: bigint
    readonly toBlock: bigint
  }) => void
}) =>
  createPublicClient({
    chain: mainnet,
    pollingInterval: 1,
    transport: custom(
      {
        request: async ({ method, params: rpcParams }) => {
          const latest = params.latestBlockNumber ?? 100n
          if (method === 'eth_blockNumber') return toHex(latest)
          if (method === 'eth_getLogs') {
            const { fromBlock, toBlock } = getLogRange(rpcParams, latest)
            params.onLogRange?.({ fromBlock, toBlock })
            const executionBlock = params.executionBlockNumber ?? 42n
            if (
              params.hasExecution === false ||
              executionBlock < fromBlock ||
              executionBlock > toBlock
            )
              return []
            return [
              {
                address: params.ownerAddress,
                blockHash: zeroHash,
                blockNumber: toHex(executionBlock),
                data: zeroHash,
                logIndex: '0x0',
                removed: false,
                topics: [
                  toEventSelector(`${params.event}(bytes32,uint256)`),
                  params.safeTxHash,
                ],
                transactionHash: params.executionHash,
                transactionIndex: '0x0',
              },
            ]
          }
          throw new Error(`Unexpected Safe execution RPC method: ${method}`)
        },
      },
      { retryCount: 0 },
    ),
  })
