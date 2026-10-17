import type { RhinestoneAccountConfig } from '@rhinestone/sdk'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { l2Sources } from '@/config'
import { getL2BalancesQueryOptions } from '../../../data/queries/l2Balances.query'
import { getL2PaymentQuoteQueryOptions } from '../../../data/queries/l2PaymentQuote.query'
import type { RegistrationV2UiActor } from '../../../state/registrationUi.context'
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
  row.option.balanceRaw >= row.amountInRaw

/**
 * A row per L2 the registration can be paid from, listed next to the wallet's
 * own USDC. Every row with the balance for it is quoted for both legs, each an
 * intent the wallet signs there; the reveal's delivers the price to the HCA.
 */
export const useL2Payment = ({
  uiActor,
  owner,
  hca,
  label,
  duration,
  priceRaw,
  primaryName,
  isEnabled,
  fundingSourceChainId,
}: {
  readonly uiActor: RegistrationV2UiActor
  readonly owner: Address | null
  readonly hca:
    | Readonly<{ address: Address; config: RhinestoneAccountConfig }>
    | undefined
  readonly label: string
  readonly duration: bigint
  /** The name's price for `duration`; `undefined` until read. */
  readonly priceRaw: bigint | undefined
  readonly primaryName: string | undefined
  /** Off on the EOA route, which has no HCA to pay into. */
  readonly isEnabled: boolean
  readonly fundingSourceChainId: number | undefined
}): L2PaymentProps | undefined => {
  const balances = useQuery(
    getL2BalancesQueryOptions(isEnabled && owner ? owner : undefined),
  ).data
  const options = isEnabled
    ? getL2PaymentOptions({
        sources: l2Sources,
        balances,
        amountRaw: priceRaw ?? null,
      })
    : []
  const quoted = options.map((option) =>
    owner && hca && priceRaw !== undefined && option.status === 'available'
      ? {
          owner,
          source: option.source,
          hca,
          label,
          duration,
          price: priceRaw,
          primaryName,
        }
      : undefined,
  )
  const quotes = useQueries({
    queries: quoted.map((params) => getL2PaymentQuoteQueryOptions(params)),
  })

  if (options.length === 0) return undefined
  const rows = options.map((option, index): L2PaymentRow => {
    const isQuoted = quoted[index] !== undefined
    const quote = quotes[index]
    return {
      option,
      amountInRaw: isQuoted ? quote?.data?.amountIn : undefined,
      isQuoteLoading: isQuoted && !!quote?.isLoading,
      hasQuoteFailed: isQuoted && !!quote?.isError,
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
