import { match } from 'ts-pattern'
import type { TOKEN_SYMBOL } from '@/lib/tokens'

export type PaymentChoice =
  | { readonly kind: 'wallet'; readonly symbol: TOKEN_SYMBOL }
  | { readonly kind: 'l2'; readonly chainId: number }

export type PayableMethod = Readonly<{
  choice: PaymentChoice
  balanceRaw: bigint
  decimals: number
}>

/**
 * The selected method: covers the payment, falls short, or nothing is chosen
 * yet. `auto` covers it too, but was picked here rather than by the user.
 */
export type CurrentMethodState = 'payable' | 'auto' | 'short' | 'none'

const COMPARE_DECIMALS = 18

const toComparable = ({ balanceRaw, decimals }: PayableMethod) =>
  balanceRaw * 10n ** BigInt(COMPARE_DECIMALS - decimals)

const holdingMost = (methods: readonly PayableMethod[]) =>
  methods.reduce<PayableMethod | undefined>(
    (best, method) =>
      best === undefined || toComparable(method) > toComparable(best)
        ? method
        : best,
    undefined,
  )

/**
 * What to switch to when the current method can't pay: the payable method
 * holding the most. A tie keeps list order, so the wallet wins it. With
 * nothing chosen yet, a wallet coin that can pay goes first, as it needs no
 * bridge; a method picked here gives way to that wallet coin too.
 */
export const getFallbackPaymentChoice = ({
  current,
  payableMethods,
}: {
  readonly current: CurrentMethodState
  readonly payableMethods: readonly PayableMethod[]
}): PaymentChoice | undefined => {
  const walletMethods = payableMethods.filter(
    ({ choice }) => choice.kind === 'wallet',
  )
  const candidates = match(current)
    .with('payable', () => [])
    .with('auto', () => walletMethods)
    .with('none', () =>
      walletMethods.length > 0 ? walletMethods : payableMethods,
    )
    .with('short', () => payableMethods)
    .exhaustive()
  return holdingMost(candidates)?.choice
}
