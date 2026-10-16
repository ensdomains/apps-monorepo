import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { l2Sources } from '@/config'
import { getL2BalancesQueryOptions } from '../../../data/queries/l2Balances.query'
import { getL2BridgeQuoteQueryOptions } from '../../../data/queries/l2BridgeQuote.query'
import { getL2FundingRoute } from '../../../service/l2FundingRoute'
import type { RegistrationV2UiActor } from '../../../state/registrationUi.context'
import { useL2FundingResume } from '../../../state/useL2FundingResume'
import {
  getL2BridgeAmount,
  getL2PaymentOptions,
  type L2PaymentOption,
} from '../lib/paymentOptions'

/** The registration picker's L2 rows, and what choosing one does. */
export type L2PaymentProps = Readonly<{
  options: readonly L2PaymentOption[]
  bridgeAmountRaw: bigint | null
  /** Unset while the wallet row is the choice. */
  selectedChainId: number | undefined
  /** The selected row's quoted bridge fee. */
  feeRaw: bigint | undefined
  isQuoteLoading: boolean
  hasQuoteFailed: boolean
  canBridge: boolean
  onSelect: (chainId: number) => void
  onBridge: () => void
}>

/**
 * L2 rows that bridge the wallet's shortfall in, sized from the same debit the
 * wallet row is gated on, and a pick-up of a bridge already in flight. Only
 * offered while the wallet is short: a covered wallet sees its own row alone.
 */
export const useL2Payment = ({
  uiActor,
  owner,
  walletDebitRaw,
  walletBalanceRaw,
  isQuoteStale,
  isEnabled,
  fundingSourceChainId,
}: {
  readonly uiActor: RegistrationV2UiActor
  readonly owner: Address | null
  readonly walletDebitRaw: bigint | undefined
  readonly walletBalanceRaw: bigint | null
  /** The debit on screen belongs to another primary-name choice. */
  readonly isQuoteStale: boolean
  /** Off on the EOA route, which has no budget to bridge towards. */
  readonly isEnabled: boolean
  readonly fundingSourceChainId: number | undefined
}): L2PaymentProps | undefined => {
  useL2FundingResume({ uiActor, ownerAddress: owner })
  const bridgeAmountRaw =
    walletDebitRaw === undefined || walletBalanceRaw === null || isQuoteStale
      ? null
      : getL2BridgeAmount({ walletDebitRaw, walletBalanceRaw })
  // Only read the L2s once the wallet is known to be short.
  const balances = useQuery(
    getL2BalancesQueryOptions(
      isEnabled && owner && bridgeAmountRaw ? owner : undefined,
    ),
  ).data
  const options = isEnabled
    ? getL2PaymentOptions({ sources: l2Sources, balances, bridgeAmountRaw })
    : []
  const selected = options.find(
    ({ source, status }) =>
      source.chain.id === fundingSourceChainId && status !== 'not-needed',
  )
  const route =
    owner && bridgeAmountRaw && selected?.status === 'available'
      ? getL2FundingRoute({
          owner,
          source: selected.source,
          amountOut: bridgeAmountRaw,
        })
      : undefined
  const quoteQuery = useQuery(getL2BridgeQuoteQueryOptions(route))
  const quote = route ? quoteQuery.data : undefined

  if (!bridgeAmountRaw || options.length === 0) return undefined
  return {
    options,
    bridgeAmountRaw,
    selectedChainId: selected?.source.chain.id,
    feeRaw: quote && quote.amountIn - quote.amountReceived,
    isQuoteLoading: !!route && quoteQuery.isLoading,
    hasQuoteFailed: !!route && quoteQuery.isError,
    canBridge: !!quote && !quoteQuery.isError,
    onSelect: (chainId) =>
      uiActor.send({ type: 'pricing.fundingSource.select', chainId }),
    onBridge: () => {
      if (!route || !quote) return
      uiActor.send({
        type: 'pricing.funding.start',
        route,
        agreedAmountIn: quote.amountIn,
      })
    },
  }
}
