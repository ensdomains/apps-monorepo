import { checkIsSafeWallet } from '@ens-apps/transaction-manager'
import { findSafeExecution } from '@ens-apps/transaction-manager/helpers/safe-execution.helpers'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  type Connector,
  getPublicClient,
  type Config as WagmiConfig,
} from '@wagmi/core'
import { type Address, type Hex, type PublicClient, parseAbi } from 'viem'
import { withRequestDeadline } from '../service/requestDeadline'
import {
  getCommemorativeNftSafeHistoryCheckpoint,
  getCommemorativeNftSafeHistoryPages,
} from './safeExecutionHistory.helpers'

const SAFE_EXECUTION_EVENTS = parseAbi([
  'event ExecutionSuccess(bytes32 indexed txHash, uint256 payment)',
  'event ExecutionFailure(bytes32 indexed txHash, uint256 payment)',
])

class CommemorativeNftSafeHistoryError extends TaggedError(
  'CommemorativeNftSafeHistoryError',
)<{ cause: unknown }> {}

export const readCommemorativeNftSafeSubmissionBlock = async (params: {
  readonly wagmiConfig: WagmiConfig
  readonly chainId: number
  readonly connector?: Connector
}): Promise<bigint | undefined> => {
  if (!(await checkIsSafeWallet(params.connector))) return undefined
  const publicClient = getPublicClient(params.wagmiConfig, {
    chainId: params.chainId,
  })
  if (!publicClient)
    throw new CommemorativeNftSafeHistoryError({
      cause: undefined,
      message: 'NFT public client is unavailable',
    })
  return withRequestDeadline(() =>
    publicClient.getBlockNumber({ cacheTime: 0 }),
  )
}

export const readHistoricalCommemorativeNftSafeExecution = async (params: {
  readonly publicClient: PublicClient
  readonly connector?: Connector
  readonly ownerAddress: Address
  readonly safeTxHash: Hex
  readonly searchFromBlock?: bigint
  readonly onHistoryProgress?: (fromBlock: bigint) => void
  readonly signal: AbortSignal
}): Promise<ReturnType<typeof findSafeExecution>> => {
  const isSafe = await checkIsSafeWallet(params.connector).catch(() => false)
  if (!isSafe) return undefined
  const latestBlock = await withRequestDeadline(
    () => params.publicClient.getBlockNumber({ cacheTime: 0 }),
    { signal: params.signal },
  )
  const searchFromBlock = params.searchFromBlock ?? 0n
  const pages = getCommemorativeNftSafeHistoryPages({
    searchFromBlock,
    latestBlock,
  })
  for (const page of pages) {
    params.signal.throwIfAborted()
    const logs = await withRequestDeadline(
      () =>
        params.publicClient.getLogs({
          address: params.ownerAddress,
          events: SAFE_EXECUTION_EVENTS,
          strict: false,
          fromBlock: page.fromBlock,
          toBlock: page.toBlock,
        }),
      { signal: params.signal },
    )
    params.signal.throwIfAborted()
    const execution = findSafeExecution(logs, params.safeTxHash)
    if (execution) return execution
    const checkpoint = getCommemorativeNftSafeHistoryCheckpoint({
      page,
      searchFromBlock,
    })
    if (checkpoint !== undefined) params.onHistoryProgress?.(checkpoint)
  }
  return undefined
}
