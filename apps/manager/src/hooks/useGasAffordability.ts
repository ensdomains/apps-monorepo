import {
  assessGasAffordability,
  type GasAffordability,
} from '@ens-apps/utils/gasAffordability'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { getBalance } from 'viem/actions'
import { publicClient } from '@/lib/wagmi'

/**
 * Whether `address` can cover `estimatedFeeWei` of EOA gas.
 *
 * Only call this for flows that actually spend native currency. The HCA route
 * pays its network fee in USDC out of the funding budget and asks the wallet
 * for signatures only, so warning about sETH there would name a cost the user
 * never pays.
 *
 * A balance that cannot be read yields `unknown`, never `short`: the caller
 * should stay silent rather than warn on a transport blip.
 */
export function useGasAffordability(params: {
  readonly address: Address | undefined
  readonly estimatedFeeWei: bigint | null
}): GasAffordability {
  const { address, estimatedFeeWei } = params

  const { data: balanceWei } = useQuery({
    queryKey: $qk({
      $scope: 'wallet',
      $action: 'nativeBalance',
      address: address ?? null,
    }),
    queryFn: () =>
      address ? getBalance(publicClient, { address }) : Promise.resolve(null),
    enabled: Boolean(address),
    // Gas is spent while the user sits on this screen; a stale balance would
    // keep clearing a wallet that has since run dry.
    refetchInterval: 30_000,
  })

  // `isEstimateComplete` is left at its default: the migration estimate prices
  // the whole plan in one go and only reaches `ready` when every step costed, so
  // there is never a partial sum here the way there is in a step-by-step flow.
  return assessGasAffordability({
    balanceWei: balanceWei ?? null,
    estimatedFeeWei,
  })
}
