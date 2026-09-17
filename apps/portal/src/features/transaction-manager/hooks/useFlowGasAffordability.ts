import type { TransactionMachineActor } from '@ens-apps/transaction-manager'
import {
  assessGasAffordability,
  type GasAffordability,
  sumStepFees,
} from '@ens-apps/utils/gasAffordability'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Address } from 'viem'
import { getBalance } from 'viem/actions'
import { useEstimateFeesPerGas, usePublicClient, useWalletClient } from 'wagmi'
import { sepoliaWithEns } from '@/lib/wagmi'
import type { WalletClientWithAccount } from '@/utils/types'
import type { Transaction } from '../types'
import {
  parseUnpaidStepKey,
  prepareUnpaidStepRequests,
  priceStepGas,
  unpaidStepKey,
} from '../utils/flowGasSteps'
import { getStatus } from '../utils/getStatus'
import { estimateGasForCall } from './useTransactionGasEstimate'

type FlowGasEstimateParams = {
  readonly chainId: number | undefined
  readonly from: Address | undefined
  readonly to: Address | undefined
  readonly data: string | undefined
  readonly value: string | undefined
  readonly gas: string | undefined
}

const flowGasEstimateQueryKey = createQueryKey<
  'flow-gas-estimate',
  FlowGasEstimateParams
>('flow-gas-estimate')

const nativeBalanceQueryKey = createQueryKey<
  'native-balance',
  { readonly address: Address | undefined }
>('native-balance')

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

  // Recomputed every render: an actor mutates its own snapshot in place without
  // replacing the Map, so anything memoized on the Map's identity would keep
  // counting a step that has already settled. The component re-renders on those
  // transitions anyway (see useActiveTransactionState).
  const unpaidKey = unpaidStepKey(
    transactions,
    (id) => getStatus(id, activeTransactionsMap) === 'success',
  )

  const preparedRequests = useMemo(
    () =>
      prepareUnpaidStepRequests({
        transactions,
        unpaidIds: parseUnpaidStepKey(unpaidKey),
        walletClient: readyWalletClient,
        chainId: sepoliaWithEns.id,
      }),
    [transactions, unpaidKey, readyWalletClient],
  )

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
      queryKey: flowGasEstimateQueryKey({
        chainId: request?.chainId,
        from: request?.from,
        to: request?.to,
        data: request?.data,
        value: request?.value?.toString(),
        gas: request?.gas?.toString(),
      }),
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
    queryKey: nativeBalanceQueryKey({
      address: readyWalletClient?.account.address,
    }),
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
      sumStepFees(
        priceStepGas(
          gasQueries.map((query) => query.data),
          maxFeePerGas,
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
