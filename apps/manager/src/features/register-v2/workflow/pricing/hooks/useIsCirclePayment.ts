import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { getL2BalancesQueryOptions } from '../../../data/queries/l2Balances.query'
import { isCirclePaymentMethod } from '../lib/paymentOptions'

/** Whether the chosen method pays in Circle's USDC, off the L2 wallets the rows read. */
export const useIsCirclePayment = ({
  owner,
  isPaidWithEth,
  l2ChainId,
}: {
  readonly owner: Address | null | undefined
  readonly isPaidWithEth: boolean
  readonly l2ChainId: number | undefined
}): boolean => {
  const l2Wallets = useQuery(
    getL2BalancesQueryOptions(
      l2ChainId === undefined ? undefined : (owner ?? undefined),
    ),
  ).data
  return isCirclePaymentMethod({ isPaidWithEth, l2ChainId, l2Wallets })
}
