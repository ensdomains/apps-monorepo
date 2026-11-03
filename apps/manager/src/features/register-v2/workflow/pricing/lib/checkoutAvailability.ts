import { match } from 'ts-pattern'
import { getCheckoutSummary } from './checkoutSummary'

/** A balance in USDC (6 decimals): known once a read succeeded, unknown while loading or after a failure. */
export type BalanceRead =
  | Readonly<{ status: 'known'; usdcRaw: bigint }>
  | Readonly<{ status: 'unknown' }>

/** Where a registration could be paid from. */
export type PaymentSources = Readonly<{
  wallet: BalanceRead
  l2s: readonly BalanceRead[]
  /** The wallet's ETH valued in USDC; absent where ETH is not offered. */
  eth?: BalanceRead
}>

export type CheckoutAvailability = 'payable' | 'insufficient' | 'unknown'

export const UNKNOWN_BALANCE: BalanceRead = { status: 'unknown' }

export const knownBalance = (usdcRaw: bigint): BalanceRead => ({
  status: 'known',
  usdcRaw,
})

const covers = (read: BalanceRead, totalRaw: bigint) =>
  read.status === 'known' && read.usdcRaw >= totalRaw

// The swap only buys what the wallet's USDC is short of, so ETH and that USDC pay together.
const walletWithEth = ({ wallet, eth }: PaymentSources): BalanceRead =>
  eth?.status === 'known'
    ? knownBalance(
        (wallet.status === 'known' ? wallet.usdcRaw : 0n) + eth.usdcRaw,
      )
    : UNKNOWN_BALANCE

/** Whether any source covers `totalRaw`. Network fees are left to the payment sheet. */
export const getCheckoutAvailability = (
  totalRaw: bigint,
  sources: PaymentSources,
): CheckoutAvailability => {
  const candidates = [sources.wallet, ...sources.l2s, walletWithEth(sources)]
  if (candidates.some((read) => covers(read, totalRaw))) return 'payable'
  const reads = [
    sources.wallet,
    ...sources.l2s,
    ...(sources.eth ? [sources.eth] : []),
  ]
  return reads.some((read) => read.status === 'unknown')
    ? 'unknown'
    : 'insufficient'
}

export type CheckoutAction =
  | Readonly<{ kind: 'connect' }>
  | Readonly<{ kind: 'preparing' }>
  | Readonly<{ kind: 'insufficient' }>
  | Readonly<{ kind: 'continue'; isEnabled: boolean }>

/** The registration page's button. Only a known shortfall blocks it; an unknown balance does not. */
export const getCheckoutAction = (params: {
  readonly isConnected: boolean
  readonly isPreparing: boolean
  readonly availability: CheckoutAvailability
  readonly canNext: boolean
}): CheckoutAction =>
  match(params)
    .returnType<CheckoutAction>()
    .with({ isConnected: false }, () => ({ kind: 'connect' }))
    .with({ isPreparing: true }, () => ({ kind: 'preparing' }))
    .with({ availability: 'insufficient' }, () => ({ kind: 'insufficient' }))
    .otherwise(({ canNext }) => ({ kind: 'continue', isEnabled: canNext }))

/** The page's availability: unknown until the account's own balance is read, as it may cover the name itself. */
export const getPageAvailability = (
  nameCostRaw: bigint,
  accountBalance: BalanceRead,
  sources: PaymentSources,
): CheckoutAvailability =>
  accountBalance.status === 'unknown'
    ? 'unknown'
    : getCheckoutAvailability(
        getCheckoutSummary(nameCostRaw, accountBalance.usdcRaw).totalRaw,
        sources,
      )
