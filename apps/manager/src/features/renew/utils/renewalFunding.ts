import type { RENEWAL_TOKEN, TOKEN_SYMBOL } from '@/lib/tokens'

/** The rent is paid in the chosen coin; the intent's fee is always USDC. */
const FEE_TOKEN: TOKEN_SYMBOL = 'USDC'

export type RenewalFundingSummary = {
  readonly registration: number
  readonly networkFee: number
  /** Rent with its approval headroom plus the fee: the figure shown as "up to". */
  readonly total: number
  /** What the wallet must cover in the chosen coin after the account's own balance. */
  readonly walletDebit: number
  /** The account's balance of the chosen coin that the renewal uses. */
  readonly hcaCredit: number
}

export type RenewalFunding = {
  readonly summary: RenewalFundingSummary
  /** What the wallet must cover in `symbol`: the fee only counts against USDC. */
  readonly walletDebitFor: (symbol: TOKEN_SYMBOL) => number
}

/**
 * What a smart-account renewal needs from the wallet, per coin. The rent
 * (with its headroom) is owed in the chosen coin and the fee in USDC, and the
 * account's own balance of each pays first.
 */
export const computeRenewalFunding = (params: {
  readonly price: number
  /** The rent with its approval headroom, in the chosen coin. */
  readonly funded: number
  readonly networkFee: number
  readonly selectedToken: RENEWAL_TOKEN
  readonly accountCredit: Partial<Record<TOKEN_SYMBOL, number>>
}): RenewalFunding => {
  const { price, funded, networkFee, selectedToken, accountCredit } = params

  const grossFor = (symbol: TOKEN_SYMBOL) =>
    funded + (symbol === FEE_TOKEN ? networkFee : 0)
  const creditFor = (symbol: TOKEN_SYMBOL) =>
    Math.min(accountCredit[symbol] ?? 0, grossFor(symbol))
  const walletDebitFor = (symbol: TOKEN_SYMBOL) =>
    Math.max(0, grossFor(symbol) - creditFor(symbol))

  return {
    summary: {
      registration: price,
      networkFee,
      total: funded + networkFee,
      walletDebit: walletDebitFor(selectedToken),
      hcaCredit: creditFor(selectedToken),
    },
    walletDebitFor,
  }
}
