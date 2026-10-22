import type { RENEWAL_TOKEN, TOKEN_SYMBOL } from '@/lib/tokens'

/** The rent is paid in the chosen coin; the intent's fee is always USDC. */
const FEE_TOKEN: TOKEN_SYMBOL = 'USDC'

export type RenewalFundingSummary = {
  /** The rent with its approval headroom: what the renewer may pull. */
  readonly registration: number
  readonly networkFee: number
  /** Rent with headroom plus the fee: the figure shown as "up to". */
  readonly total: number
  /** What the wallet covers across both coins after the account's own balances. */
  readonly walletDebit: number
  /** The account balances the renewal uses, across both coins. */
  readonly hcaCredit: number
}

export type RenewalFunding = {
  readonly summary: RenewalFundingSummary
  /** What the wallet must cover in `symbol` if it pays the rent: the fee only counts against USDC. */
  readonly walletDebitFor: (symbol: TOKEN_SYMBOL) => number
}

type Leg = readonly [symbol: TOKEN_SYMBOL, amount: number]

/**
 * What a smart-account renewal needs from the wallet. The rent (with its
 * headroom) is owed in the chosen coin and the fee in USDC, and the account's
 * own balance of each pays first.
 */
export const computeRenewalFunding = (params: {
  /** The rent with its approval headroom, in the chosen coin. */
  readonly funded: number
  readonly networkFee: number
  readonly selectedToken: RENEWAL_TOKEN
  readonly accountCredit: Partial<Record<TOKEN_SYMBOL, number>>
}): RenewalFunding => {
  const { funded, networkFee, selectedToken, accountCredit } = params

  const creditOf = (symbol: TOKEN_SYMBOL, amount: number) =>
    Math.min(accountCredit[symbol] ?? 0, amount)
  const debitOf = ([symbol, amount]: Leg) =>
    Math.max(0, amount - creditOf(symbol, amount))

  // Were `symbol` the chosen coin, it would owe the rent, plus the fee if it is USDC.
  const walletDebitFor = (symbol: TOKEN_SYMBOL) =>
    debitOf([symbol, funded + (symbol === FEE_TOKEN ? networkFee : 0)])

  // The headline covers both coins: the rent in the chosen one, the fee in USDC.
  const legs: readonly Leg[] =
    selectedToken === FEE_TOKEN
      ? [[FEE_TOKEN, funded + networkFee]]
      : [
          [selectedToken, funded],
          [FEE_TOKEN, networkFee],
        ]

  return {
    summary: {
      registration: funded,
      networkFee,
      total: funded + networkFee,
      walletDebit: legs.reduce((sum, leg) => sum + debitOf(leg), 0),
      hcaCredit: legs.reduce((sum, leg) => sum + creditOf(...leg), 0),
    },
    walletDebitFor,
  }
}
