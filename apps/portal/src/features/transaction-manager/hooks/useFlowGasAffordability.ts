import type { TransactionMachineActor } from '@ens-apps/transaction-manager'
import {
  assessGasAffordability,
  type GasAffordability,
  sumStepFees,
} from '@ens-apps/utils/gasAffordability'
import { useQueries, useQuery } from '@tanstack/react-query'
import { fromThrowable } from 'neverthrow'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { getBalance } from 'viem/actions'
import { useEstimateFeesPerGas, usePublicClient, useWalletClient } from 'wagmi'
import { sepoliaWithEns } from '@/lib/wagmi'
import type { WalletClientWithAccount } from '@/utils/types'
import type { Transaction } from '../types'
import { getStatus } from '../utils/getStatus'
import { estimateGasForCall } from './useTransactionGasEstimate'

/**
 * Whether the connected wallet can pay for every step of a flow that has not
 * run yet.
 *
 * `EstimatedGasCost` answers this one step at a time and only in ETH-formatted
 * text, which is the wrong shape twice over: a user with enough for the approve
 * but not the register still clears every per-step figure, and the flow then
 * strands them between two transactions. This sums the remaining steps instead
 * and compares the total against the balance.
 *
 * Only for EOA-paid flows. Steps that have already settled are excluded, so the
 * verdict tightens as the flow progresses rather than re-charging for work the
 * user has already paid for.
 */
export function useFlowGasAffordability(params: {
  readonly transactions: readonly Transaction[]
  readonly activeTransactionsMap: Map<string, TransactionMachineActor>
}): GasAffordability {
  const { transactions, activeTransactionsMap } = params

  const { data: walletClient } = useWalletClient()
  const readyWalletClient =
    walletClient?.account && walletClient.chain
      ? (walletClient as WalletClientWithAccount)
      : undefined

  // Steps already mined are paid for; re-counting them would over-state what
  // the user still needs and warn a wallet that can finish the flow.
  //
  // Recomputed every render rather than memoized on the Map: an actor mutates
  // its own snapshot in place without replacing the Map, so a memo keyed on the
  // Map's identity keeps counting a step that has already settled and can flash
  // a false shortfall. The component re-renders on those transitions anyway (see
  // useActiveTransactionState), and filtering a handful of steps is cheap.
  // Carried as a string so the memo below re-encodes when the pending SET
  // changes, rather than on every render (the filtered array is a new identity
  // each time) or never (the Map's identity is stable across transitions).
  const pendingKey = transactions
    .filter(
      (transaction) =>
        getStatus(transaction.id, activeTransactionsMap) !== 'success',
    )
    .map((transaction) => transaction.id)
    .join('|')

  // Same preparation contract as EstimatedGasCost: builders throw on states the
  // UI reaches legitimately (nothing selected yet, an earlier step not run), and
  // a step we cannot encode drops out of the sum and marks it incomplete.
  const preparedRequests = useMemo(() => {
    const pendingIds = new Set(pendingKey ? pendingKey.split('|') : [])
    return transactions
      .filter((transaction) => pendingIds.has(transaction.id))
      .map((transaction) => {
        const prepare = transaction.intent?.prepare
        if (!readyWalletClient || !prepare) return undefined
        const prepared = fromThrowable(
          prepare,
          () => undefined,
        )({
          walletClient: readyWalletClient,
          chainId: sepoliaWithEns.id,
        }).unwrapOr(undefined)
        const request = prepared?.request
        return request?.type === 'eoa' ? request : undefined
      })
  }, [transactions, pendingKey, readyWalletClient])

  const chainId = preparedRequests.find((r) => r)?.chainId
  const publicClient = usePublicClient({ chainId })

  // Priced on the same EIP-1559 ceiling the transaction manager submits under,
  // matching how a single step's cost is quoted.
  const feeQuery = useEstimateFeesPerGas({
    chainId,
    query: { enabled: Boolean(publicClient) && chainId !== undefined },
  })

  const gasQueries = useQueries({
    queries: preparedRequests.map((request) => ({
      queryKey: [
        'flow-gas-estimate',
        request?.chainId,
        request?.from,
        request?.to,
        request?.data,
        request?.value?.toString(),
        request?.gas?.toString(),
      ] as const,
      enabled: Boolean(request?.to && request?.data && publicClient),
      queryFn: (): Promise<bigint> => {
        if (!request || !publicClient) throw new Error('No call to estimate')
        return estimateGasForCall(publicClient, request)
      },
      // A step that reverts under estimation contributes nothing rather than
      // failing the whole verdict; the headroom absorbs the under-count.
      retry: false,
    })),
  })

  const { data: balanceWei } = useQuery({
    queryKey: ['native-balance', readyWalletClient?.account.address] as const,
    queryFn: () => {
      const address = readyWalletClient?.account.address as Address | undefined
      if (!address || !publicClient) return null
      return getBalance(publicClient, { address })
    },
    enabled: Boolean(readyWalletClient?.account.address && publicClient),
    refetchInterval: 30_000,
  })

  const maxFeePerGas = feeQuery.data?.maxFeePerGas
  const feeSum = useMemo(
    () =>
      maxFeePerGas === undefined
        ? { total: null, isComplete: false }
        : sumStepFees(
            gasQueries.map((query) =>
              query.data === undefined ? null : query.data * maxFeePerGas,
            ),
          ),
    [gasQueries, maxFeePerGas],
  )

  return assessGasAffordability({
    balanceWei: balanceWei ?? null,
    estimatedFeeWei: feeSum.total,
    // A registration cannot encode `register` until the commitment exists, so
    // early on the sum covers the cheap steps and omits the dearest one. Passing
    // this through keeps that partial figure from clearing a wallet it should
    // not, while still letting it prove a shortfall.
    isEstimateComplete: feeSum.isComplete,
  })
}
