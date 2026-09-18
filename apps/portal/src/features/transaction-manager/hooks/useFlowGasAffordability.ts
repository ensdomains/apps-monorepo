import type { TransactionMachineActor } from '@ens-apps/transaction-manager'
import {
  assessGasAffordability,
  type GasAffordability,
  sumStepFees,
} from '@ens-apps/utils/gasAffordability'
import { useQueries } from '@tanstack/react-query'
import {
  useBalance,
  useEstimateFeesPerGas,
  usePublicClient,
  useWalletClient,
} from 'wagmi'
import { sepoliaWithEns } from '@/lib/wagmi'
import type { WalletClientWithAccount } from '@/utils/types'
import type { Transaction } from '../types'
import { prepareUnpaidStepRequests } from '../utils/flowGasSteps'
import { getStatus } from '../utils/getStatus'
import {
  estimateGasForCall,
  isRevertError,
  MAX_TRANSIENT_RETRIES,
  PREVIEW_STALE_TIME,
  stepGasEstimateQueryKey,
} from './useTransactionGasEstimate'

const BALANCE_REFETCH_MS = 30_000

/**
 * Whether the connected wallet can pay for every step of a flow that has not
 * run yet.
 *
 * `EstimatedGasCost` answers this one step at a time, so a wallet that covers
 * the approve but not the register clears every per-step figure and is then
 * stranded between two transactions. This sums the remaining steps instead.
 *
 * Shares `stepGasEstimateQueryKey` with that hook, so each step is estimated
 * once and the warning can never quote a different number than the row above it.
 */
export function useFlowGasAffordability({
  transactions,
  activeTransactionsMap,
}: {
  readonly transactions: readonly Transaction[]
  readonly activeTransactionsMap: Map<string, TransactionMachineActor>
}): GasAffordability {
  const chainId = sepoliaWithEns.id
  const publicClient = usePublicClient({ chainId })
  const { data: walletClient } = useWalletClient()
  const readyWalletClient =
    walletClient?.account && walletClient.chain
      ? (walletClient as WalletClientWithAccount)
      : undefined

  // Recomputed every render: an actor mutates its own snapshot in place without
  // replacing the Map, so anything memoized on the Map keeps counting a settled
  // step. The component re-renders on those transitions anyway.
  const preparedRequests = prepareUnpaidStepRequests({
    transactions,
    isSettled: (id) => getStatus(id, activeTransactionsMap) === 'success',
    walletClient: readyWalletClient,
    chainId,
  })

  const feeQuery = useEstimateFeesPerGas({
    chainId,
    query: { staleTime: PREVIEW_STALE_TIME, retry: MAX_TRANSIENT_RETRIES },
  })

  const gasQueries = useQueries({
    queries: preparedRequests.map((request) => ({
      queryKey: stepGasEstimateQueryKey({
        chainId: request?.chainId,
        from: request?.from,
        to: request?.to,
        data: request?.data,
        value: request?.value?.toString(),
        gas: request?.gas?.toString(),
        started: false,
      }),
      enabled: Boolean(request?.to && request?.data && publicClient),
      staleTime: PREVIEW_STALE_TIME,
      // A revert is deterministic and leaves the step unpriced; a transport
      // blip is worth retrying, or the flow quietly looks cheaper than it is.
      retry: (failureCount: number, error: unknown) =>
        !isRevertError(error) && failureCount < MAX_TRANSIENT_RETRIES,
      queryFn: (): Promise<bigint> => {
        if (!request || !publicClient) throw new Error('No call to estimate')
        return estimateGasForCall(publicClient, request)
      },
    })),
  })

  const { data: balance } = useBalance({
    address: readyWalletClient?.account.address,
    chainId,
    query: { refetchInterval: BALANCE_REFETCH_MS },
  })

  const { total, isComplete } = sumStepFees(
    gasQueries.map((query) => query.data),
    feeQuery.data?.maxFeePerGas,
  )

  return assessGasAffordability({
    balanceWei: balance?.value ?? null,
    estimatedFeeWei: total,
    // A registration cannot encode `register` until the commitment exists, so
    // early on the sum omits the dearest step.
    isEstimateComplete: isComplete,
  })
}
