import type {
  TransactionMachineActor,
  TransactionRequest,
} from '@ens-apps/transaction-manager'
import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import { formatEther } from 'viem'
import { usePublicClient } from 'wagmi'

/**
 * The estimate's state, so callers can show honest UI:
 * - `idle` — no call to estimate yet (no descriptor intent, wallet not ready, or
 *   step not started). Nothing is being calculated.
 * - `loading` — actively running `eth_estimateGas`.
 * - `error` — the call reverted or the fee lookup failed.
 * - `success` — `cost` holds the estimate.
 */
export type GasEstimateStatus = 'idle' | 'loading' | 'error' | 'success'

// Freeze the preview: the estimate is computed once when the modal opens and
// held stable rather than silently refetched. A background refetch would flash
// the cached number and then jump to a fresher one as the base fee moved, which
// reads as glitchy. It's still re-estimated for real when the step starts (the
// gas query key flips on `activeRequest`), and react-query drops the cache a few
// minutes after the modal closes, so a later session recomputes fresh.
const PREVIEW_STALE_TIME = Number.POSITIVE_INFINITY

// Gas costs are tiny ETH amounts; `formatEther` alone yields an 18-decimal
// string. Round to a few significant digits for a readable "Est. cost".
const formatGasCost = (wei: bigint): string =>
  Number(formatEther(wei)).toLocaleString('en-US', {
    maximumSignificantDigits: 4,
  })

/**
 * Fee-per-gas for a chain. Chain-global (independent of the specific call), so
 * it's a single shared query keyed on chainId — an N-step modal reuses one fee
 * lookup instead of fetching it once per step.
 */
const useFeePerGas = (chainId: number | undefined): UseQueryResult<bigint> => {
  const publicClient = usePublicClient({ chainId })
  return useQuery({
    queryKey: ['tx-fee-per-gas', chainId],
    enabled: Boolean(publicClient),
    staleTime: PREVIEW_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<bigint> => {
      if (!publicClient) throw new Error('No public client')
      const fees = await publicClient.estimateFeesPerGas().catch(() => null)
      return fees?.maxFeePerGas ?? (await publicClient.getGasPrice())
    },
  })
}

/**
 * Live gas cost (in ETH) for a transaction, via a single `eth_estimateGas` on
 * its encoded call. Prefers the call the machine holds in its context once the
 * step is started; before that it falls back to `fallbackRequest` — the call
 * from the descriptor's pre-built intent — so the estimate shows immediately.
 *
 * Returns `{ cost, status }` (see {@link GasEstimateStatus}): `cost` is the
 * formatted ETH string on success and `null` otherwise; `status` distinguishes
 * "nothing to estimate yet" (`idle`) from "calculating" (`loading`), a reverted
 * call (`error`), and a resolved estimate (`success`).
 */
export const useTransactionGasEstimate = (
  actor: TransactionMachineActor | undefined,
  fallbackRequest?: TransactionRequest,
): { cost: string | null; status: GasEstimateStatus } => {
  const snapshot = actor?.getSnapshot()
  const activeRequest = snapshot?.context.request
  const receipt = snapshot?.context.receipt
  const candidate =
    activeRequest?.type === 'eoa' ? activeRequest : fallbackRequest
  const eoa = candidate?.type === 'eoa' ? candidate : null

  // Estimate against the chain the transaction actually targets, not whatever
  // chain the wallet happens to be on. Returns undefined (→ disabled) when the
  // target chain isn't in the wagmi config, so we never show a wrong-chain cost.
  const publicClient = usePublicClient({ chainId: eoa?.chainId })
  const feeQuery = useFeePerGas(eoa?.chainId)

  const gasQuery = useQuery({
    queryKey: [
      'tx-gas-estimate',
      eoa?.chainId,
      eoa?.from,
      eoa?.to,
      eoa?.data,
      eoa?.value?.toString(),
      // Re-estimate once the step is actually started: a call that reverted
      // at modal-open (e.g. a renew before its approval, or any precondition
      // set by an earlier step) can succeed now that the prior step has run.
      Boolean(activeRequest),
    ],
    enabled: Boolean(eoa?.to && eoa?.data && publicClient && !receipt),
    staleTime: PREVIEW_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<bigint> => {
      if (!eoa || !publicClient) throw new Error('No call to estimate')
      return publicClient.estimateGas({
        account: eoa.from,
        to: eoa.to,
        data: eoa.data,
        value: eoa.value,
      })
    },
  })

  // A settled step shows its ACTUAL fee (gasUsed × effectiveGasPrice) from the
  // receipt, never a live re-estimate. Re-estimating a finished call is
  // meaningless, and for a non-repeatable call — e.g. the deterministic CREATE2
  // subregistry deploy — it reverts once mined (the proxy now exists), which
  // wrongly flipped a completed step from its cost to "Unavailable". Placed
  // after the hooks above so hook order stays stable across renders.
  if (receipt != null) {
    return receipt.status === 'success'
      ? {
          cost: formatGasCost(receipt.gasUsed * receipt.effectiveGasPrice),
          status: 'success',
        }
      : { cost: null, status: 'error' }
  }

  const gas = gasQuery.data
  const feePerGas = feeQuery.data
  const cost =
    gas != null && feePerGas != null ? formatGasCost(gas * feePerGas) : null

  // A disabled gas query means there's no call to estimate → idle (independent
  // of the always-on, chain-global fee query). `error` keys off the gas call
  // only: it's the one that reverts, and the fee query has its own getGasPrice
  // fallback, so a transient fee blip shouldn't blank an otherwise-good estimate.
  const isIdle =
    gasQuery.fetchStatus === 'idle' && gasQuery.status === 'pending'
  const status: GasEstimateStatus = isIdle
    ? 'idle'
    : gasQuery.isError
      ? 'error'
      : cost != null
        ? 'success'
        : 'loading'

  return { cost, status }
}
