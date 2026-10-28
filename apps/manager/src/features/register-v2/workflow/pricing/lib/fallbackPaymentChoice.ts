import type { TOKEN_SYMBOL } from '@/lib/tokens'

export type PaymentChoice =
  | { readonly kind: 'wallet'; readonly symbol: TOKEN_SYMBOL }
  | { readonly kind: 'l2'; readonly chainId: number }

export type PayableMethod = Readonly<{
  choice: PaymentChoice
  balanceRaw: bigint
  decimals: number
}>

const COMPARE_DECIMALS = 18

const toComparable = ({ balanceRaw, decimals }: PayableMethod) =>
  balanceRaw * 10n ** BigInt(COMPARE_DECIMALS - decimals)

/**
 * What to switch to when the current method can't pay: the payable method
 * holding the most. A tie keeps list order, so the wallet wins it.
 */
export const getFallbackPaymentChoice = ({
  isCurrentPayable,
  payableMethods,
}: {
  readonly isCurrentPayable: boolean
  readonly payableMethods: readonly PayableMethod[]
}): PaymentChoice | undefined => {
  if (isCurrentPayable) return undefined
  return payableMethods.reduce<PayableMethod | undefined>(
    (best, method) =>
      best === undefined || toComparable(method) > toComparable(best)
        ? method
        : best,
    undefined,
  )?.choice
}
