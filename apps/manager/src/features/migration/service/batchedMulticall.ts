import type { PublicClient } from 'viem'
import { multicall } from 'viem/actions'
import { withTimeout } from './withTimeout'

const PREFLIGHT_TIMEOUT_MS = 15000
const MULTICALL_BATCH_SIZE = 500

export type MulticallFailure = {
  status: 'failure'
  error: Error
  result: undefined
}

export type MulticallResult<T> =
  | { status: 'success'; result: T }
  | MulticallFailure

export const batchedMulticall = async <T>(
  publicClient: PublicClient,
  contracts: Parameters<typeof multicall>[1]['contracts'],
): Promise<MulticallResult<T>[]> => {
  const chunks: (typeof contracts)[] = []
  for (let i = 0; i < contracts.length; i += MULTICALL_BATCH_SIZE) {
    chunks.push(contracts.slice(i, i + MULTICALL_BATCH_SIZE))
  }

  const chunkResults = await Promise.all(
    chunks.map((chunk) =>
      withTimeout(
        multicall(publicClient, {
          contracts: chunk,
          allowFailure: true,
          batchSize: 0,
        }),
        PREFLIGHT_TIMEOUT_MS,
      ),
    ),
  )

  return chunkResults.flat() as MulticallResult<T>[]
}
