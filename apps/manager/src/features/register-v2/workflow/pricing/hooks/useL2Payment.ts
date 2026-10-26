import type { RhinestoneAccountConfig } from '@rhinestone/sdk'
import { useQueries, useQuery } from '@tanstack/react-query'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { l2Sources } from '@/config'
import type { HcaBudgetQuote } from '../../../data/queries/hcaBudget.query'
import { getL2ApprovalGasQueryOptions } from '../../../data/queries/l2ApprovalGas.query'
import { getL2BalancesQueryOptions } from '../../../data/queries/l2Balances.query'
import { getL2PaymentQuoteQueryOptions } from '../../../data/queries/l2PaymentQuote.query'
import { getL2QuoteRoute } from '../../../service/l2FundingSource'
import type { RegistrationV2UiActor } from '../../../state/registrationUi.context'
import { isShortOfApprovalGas } from '../lib/l2ApprovalGas'
import {
  getL2PaymentOptions,
  type L2PaymentOption,
} from '../lib/paymentOptions'

/** An L2 row, with what paying the registration from it costs there. */
export type L2PaymentRow = Readonly<{
  option: L2PaymentOption
  /** What the L2 is charged, once quoted. */
  amountInRaw: bigint | undefined
  isQuoteLoading: boolean
  hasQuoteFailed: boolean
  /** Needs the one-off Permit2 approval here, without the ETH to pay for it. */
  isShortOfGas: boolean
}>

/** The registration picker's L2 rows, and what choosing one does. */
export type L2PaymentProps = Readonly<{
  rows: readonly L2PaymentRow[]
  /** Unset while the wallet row is the choice. */
  selectedChainId: number | undefined
  onSelect: (chainId: number) => void
}>

/** Quoted, and the balance there covers the quote. */
export const canPayFromL2 = (row: L2PaymentRow): boolean =>
  row.option.status === 'available' &&
  !row.hasQuoteFailed &&
  row.amountInRaw !== undefined &&
  row.option.balanceRaw !== null &&
  row.option.balanceRaw >= row.amountInRaw &&
  !row.isShortOfGas

/** What the permit would carry: the budget less what the account holds. */
const getShortfall = (
  budget: HcaBudgetQuote | undefined,
  isQuoteStale: boolean,
): bigint | null => {
  if (budget === undefined || isQuoteStale) return null
  return budget.total > budget.hcaBalance
    ? budget.total - budget.hcaBalance
    : 0n
}

/**
 * A row per L2 the registration can be paid from, listed next to the wallet's
 * own USDC. Every row with the balance for it is quoted: paid from an L2, the
 * wallet signs one intent there that bridges what the permit would carry into
 * the HCA, and the registration then runs as it does from Sepolia.
 */
export const useL2Payment = ({
  uiActor,
  owner,
  hca,
  budget,
  isQuoteStale,
  isEnabled,
  fundingSourceChainId,
}: {
  readonly uiActor: RegistrationV2UiActor
  readonly owner: Address | null
  readonly hca:
    | Readonly<{ address: Address; config: RhinestoneAccountConfig }>
    | undefined
  readonly budget: HcaBudgetQuote | undefined
  /** The budget on screen belongs to another primary-name choice. */
  readonly isQuoteStale: boolean
  /** Off on the EOA route, which has no budget to pay towards. */
  readonly isEnabled: boolean
  readonly fundingSourceChainId: number | undefined
}): L2PaymentProps | undefined => {
  const amountRaw = getShortfall(budget, isQuoteStale)
  // Statuses keep the previous quote through a re-quote, so rows don't blink out and back.
  const statusAmountRaw = getShortfall(budget, false)
  const balances = useQuery(
    getL2BalancesQueryOptions(isEnabled && owner ? owner : undefined),
  ).data
  const approvalGas = useQuery(
    getL2ApprovalGasQueryOptions(isEnabled && owner ? owner : undefined),
  ).data
  const options = isEnabled
    ? getL2PaymentOptions({
        sources: l2Sources,
        balances,
        amountRaw: statusAmountRaw,
      })
    : []
  const routes = options.map((option) =>
    owner && hca && amountRaw && option.status === 'available'
      ? getL2QuoteRoute({
          owner,
          source: option.source,
          hca,
          amountOut: amountRaw,
        })
      : undefined,
  )
  const quotes = useQueries({
    queries: routes.map((route) => getL2PaymentQuoteQueryOptions(route)),
  })

  if (options.length === 0) return undefined
  const rows = options.map((option, index): L2PaymentRow => {
    const isQuoted = routes[index] !== undefined
    const quote = quotes[index]
    return {
      option,
      amountInRaw: match({ amountRaw, isQuoted })
        // The account's credit covers it all: nothing is bridged or charged.
        .with({ amountRaw: 0n }, () => 0n)
        .with({ isQuoted: true }, () => quote?.data?.amountIn)
        .otherwise(() => undefined),
      isQuoteLoading: isQuoted && !!quote?.isLoading,
      hasQuoteFailed: isQuoted && !!quote?.isError,
      isShortOfGas: isShortOfApprovalGas(
        approvalGas?.[option.source.chain.id],
        isQuoted ? (quote?.data?.amountIn ?? statusAmountRaw) : statusAmountRaw,
      ),
    }
  })
  return {
    rows,
    selectedChainId: rows.find(
      ({ option }) => option.source.chain.id === fundingSourceChainId,
    )?.option.source.chain.id,
    onSelect: (chainId) =>
      uiActor.send({ type: 'pricing.fundingSource.select', chainId }),
  }
}
