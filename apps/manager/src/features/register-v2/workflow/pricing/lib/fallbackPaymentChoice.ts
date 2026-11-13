import { match, P } from 'ts-pattern'
import type { TOKEN_SYMBOL } from '@/lib/tokens'
import type { FundingSourceOrigin } from '../../../state/registrationUi.machine'

export type PaymentChoice =
  | { readonly kind: 'wallet'; readonly symbol: TOKEN_SYMBOL }
  | { readonly kind: 'l2'; readonly chainId: number }
  | { readonly kind: 'eth' }

export type PayableMethod = Readonly<{
  choice: Exclude<PaymentChoice, { readonly kind: 'eth' }>
  balanceRaw: bigint
  decimals: number
}>

/**
 * The selected method: covers the payment, falls short, or nothing is chosen
 * yet. `auto` covers it too, but was picked here, as was `autoEth`, the last
 * resort; `chosen` is the user's pick that falls short.
 */
export type CurrentMethodState =
  | 'payable'
  | 'auto'
  | 'autoEth'
  | 'short'
  | 'chosen'
  | 'none'

/** The method being paid with, and who picked it. */
export type SelectedMethod = Readonly<{
  kind: PaymentChoice['kind']
  isPayable: boolean
  origin: FundingSourceOrigin | undefined
}>

export const getCurrentMethodState = (
  selected: SelectedMethod | undefined,
): CurrentMethodState =>
  match(selected)
    .returnType<CurrentMethodState>()
    .with(undefined, () => 'none')
    // Only a click is the user's; a default or resumed pick still gives way.
    .with({ isPayable: false, origin: 'user' }, () => 'chosen')
    .with({ isPayable: false }, () => 'short')
    .with({ kind: 'eth', origin: 'fallback' }, () => 'autoEth')
    .with({ kind: 'l2', origin: 'fallback' }, () => 'auto')
    .otherwise(() => 'payable')

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
 * bridge; a method picked here gives way to that wallet coin too. ETH, which
 * needs a swap, is taken only when nothing else can pay. When nothing can,
 * ETH is still taken over a current method the list hides, so the shortfall
 * shown is the one on screen.
 */
export const getFallbackPaymentChoice = ({
  current,
  payableMethods,
  isEthPayable = false,
  isEthListed = isEthPayable,
  isCurrentListed = true,
}: {
  readonly current: CurrentMethodState
  readonly payableMethods: readonly PayableMethod[]
  readonly isEthPayable?: boolean
  /** The ETH row is shown, payable or not. */
  readonly isEthListed?: boolean
  /** The current method has a row; a wallet coin holding dust has none. */
  readonly isCurrentListed?: boolean
}): PaymentChoice | undefined => {
  const walletMethods = payableMethods.filter(
    ({ choice }) => choice.kind === 'wallet',
  )
  const candidates = match(current)
    .with('payable', () => [])
    .with('auto', () => walletMethods)
    .with(P.union('none', 'autoEth'), () =>
      walletMethods.length > 0 ? walletMethods : payableMethods,
    )
    .with('short', () => payableMethods)
    .with('chosen', () => [])
    .exhaustive()
  const isLookingForAny = current === 'short' || current === 'none'
  const takesEth =
    isLookingForAny && (isEthPayable || (isEthListed && !isCurrentListed))
  return (
    holdingMost(candidates)?.choice ?? (takesEth ? { kind: 'eth' } : undefined)
  )
}

/**
 * Whether to say a short wallet coin can't pay: always for the user's own pick,
 * and for the app's only once no other method could take over.
 */
export const shouldShowWalletShortfall = ({
  isShort,
  current,
  hasFallback,
  isSettling,
}: {
  readonly isShort: boolean
  readonly current: CurrentMethodState
  readonly hasFallback: boolean
  /** Another method's balance or quote is still loading. */
  readonly isSettling: boolean
}): boolean =>
  isShort && (current === 'chosen' || (!hasFallback && !isSettling))
