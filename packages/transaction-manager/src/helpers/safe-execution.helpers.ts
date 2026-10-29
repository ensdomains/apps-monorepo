import { logger } from '@ens-apps/utils/logger'
import { errAsync, okAsync, type Result, ResultAsync } from 'neverthrow'
import {
  type Address,
  type Hash,
  isHash,
  type Log,
  type PublicClient,
  parseAbiItem,
  toEventSelector,
} from 'viem'
import type { Connector } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'
import {
  TransactionRevertedError,
  TransactionTimeoutError,
} from '../errors/transaction.errors'

const SAFE_EXECUTION_EVENTS = [
  parseAbiItem(
    'event ExecutionSuccess(bytes32 indexed txHash, uint256 payment)',
  ),
  parseAbiItem(
    'event ExecutionFailure(bytes32 indexed txHash, uint256 payment)',
  ),
] as const
const EXECUTION_SUCCESS = toEventSelector(SAFE_EXECUTION_EVENTS[0])
const EXECUTION_FAILURE = toEventSelector(SAFE_EXECUTION_EVENTS[1])

const SAFE_WALLET_URL = 'https://app.safe.global'

/** Reaches an execution that landed just before the wait began (~20 min of mainnet blocks). */
const LOOKBACK_BLOCKS = 100n

type SafeExecution = {
  readonly transactionHash: Hash
  readonly isSuccess: boolean
}

// Neither app has a Safe connector, so Safe{Wallet} reaches them only over
// WalletConnect. Ported from ens-app-v3's `checkIsSafeApp`.
export const checkIsSafeWallet = async (
  connector: Connector | undefined,
): Promise<boolean> => {
  if (connector?.type !== walletConnect.type) return false
  const provider = await (
    connector as Connector<ReturnType<typeof walletConnect>>
  ).getProvider()
  const peer = provider.session?.peer.metadata
  if (!peer) return false
  const peerUrl = peer.url.endsWith('/') ? peer.url.slice(0, -1) : peer.url
  return peer.name.startsWith('Safe') && peerUrl === SAFE_WALLET_URL
}

/**
 * The execution of `safeTxHash` among a Safe's logs. Safe v1.4+ indexes the
 * hash in `ExecutionSuccess`/`ExecutionFailure`; v1.3 puts it first in the data.
 */
export const findSafeExecution = (
  logs: readonly Pick<Log, 'topics' | 'data' | 'transactionHash'>[],
  safeTxHash: Hash,
): SafeExecution | undefined => {
  const id = safeTxHash.toLowerCase()
  const log = logs.find(
    ({ topics: [event, indexedHash], data }) =>
      (event === EXECUTION_SUCCESS || event === EXECUTION_FAILURE) &&
      (indexedHash?.toLowerCase() === id ||
        data.slice(0, 66).toLowerCase() === id),
  )
  return log?.transactionHash
    ? {
        transactionHash: log.transactionHash,
        isSuccess: log.topics[0] === EXECUTION_SUCCESS,
      }
    : undefined
}

/**
 * Waits for `safe` to execute `safeTxHash` and returns the execution. Reads the
 * chain, not the wallet, so the Safe app needn't be open.
 */
function waitForSafeExecution({
  publicClient,
  safe,
  safeTxHash,
  timeout,
  signal,
}: {
  readonly publicClient: PublicClient
  readonly safe: Address
  readonly safeTxHash: Hash
  readonly timeout: number
  readonly signal: AbortSignal
}): ResultAsync<SafeExecution, TransactionTimeoutError> {
  const deadline = Date.now() + timeout

  const poll = async (
    fromBlock: bigint,
  ): Promise<SafeExecution | undefined> => {
    if (signal.aborted || Date.now() > deadline) return undefined
    const logs = await publicClient
      .getLogs({ address: safe, events: SAFE_EXECUTION_EVENTS, fromBlock })
      .catch((error: unknown) => {
        logger.debug('Safe execution logs unavailable', error)
        return []
      })
    const execution = findSafeExecution(logs, safeTxHash)
    if (execution) return execution
    await new Promise((resolve) =>
      setTimeout(resolve, publicClient.pollingInterval),
    )
    return poll(fromBlock)
  }

  return ResultAsync.fromSafePromise(
    publicClient.getBlockNumber().then(
      (latest) =>
        poll(latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n),
      (error: unknown) => {
        logger.debug('eth_blockNumber unavailable', error)
        return undefined
      },
    ),
  ).andThen((execution) =>
    execution
      ? okAsync(execution)
      : errAsync(new TransactionTimeoutError(safeTxHash, timeout)),
  )
}

/**
 * Races `direct` against the Safe execution of `id`, settled through `settle`.
 * A Safe answers `eth_sendTransaction` and `wallet_sendCalls` with its
 * safeTxHash, which no node has. Only a Safe{Wallet} connection reads the logs,
 * and a success or a revert from either side decides.
 */
export function orSafeExecution<T, E1, E2>({
  publicClient,
  connector,
  account,
  id,
  timeout,
  direct,
  settle,
}: {
  readonly publicClient: PublicClient
  readonly connector: Connector | undefined
  readonly account: Address | undefined
  readonly id: string
  readonly timeout: number
  readonly direct: ResultAsync<T, E1>
  readonly settle: (hash: Hash) => ResultAsync<T, E2>
}): ResultAsync<
  T,
  E1 | E2 | TransactionTimeoutError | TransactionRevertedError
> {
  if (!account || !isHash(id)) return direct

  type WaitError = E1 | E2 | TransactionTimeoutError | TransactionRevertedError
  type Outcome = Result<T, WaitError>
  const isDecided = (result: Outcome) =>
    result.isOk() || result.error instanceof TransactionRevertedError

  return ResultAsync.fromPromise(checkIsSafeWallet(connector), (error) => error)
    .orElse((error) => {
      logger.warn('WalletConnect session unavailable', error)
      return okAsync(false)
    })
    .andThen((isSafe): ResultAsync<T, WaitError> => {
      if (!isSafe) return direct
      const controller = new AbortController()
      const viaWallet = direct.mapErr((error): WaitError => error)
      const viaSafe = waitForSafeExecution({
        publicClient,
        safe: account,
        safeTxHash: id,
        timeout,
        signal: controller.signal,
      })
        // A failed execution still waits out the carrying transaction's confirmations.
        .andThen(({ transactionHash, isSuccess }) =>
          settle(transactionHash).andThen((outcome) =>
            isSuccess
              ? okAsync(outcome)
              : errAsync(
                  new TransactionRevertedError(
                    `Safe transaction ${id} failed (tx ${transactionHash})`,
                  ),
                ),
          ),
        )
        .mapErr((error): WaitError => error)
      return new ResultAsync(
        Promise.race<Outcome>([
          viaWallet.then((result) => (isDecided(result) ? result : viaSafe)),
          viaSafe.then((result) => (isDecided(result) ? result : viaWallet)),
        ]).finally(() => controller.abort()),
      )
    })
}
