import type {
  HcaDisplayedDebit,
  HcaFundingPrompt,
} from '@ens-apps/transaction-manager'
import type { RENEWAL_TOKEN, TOKEN_SYMBOL } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

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

const debitRaw = (amount: bigint, credit: bigint | undefined) =>
  amount > (credit ?? 0n) ? amount - (credit ?? 0n) : 0n

/** The wallet debit {@link computeRenewalFunding} shows, in each coin's units; the intent may not take more. */
export const computeRenewalDisplayedDebit = (params: {
  /** The rent with its approval headroom, in the chosen coin's units. */
  readonly fundedRaw: bigint
  /** USDC (6dp). */
  readonly networkFeeRaw: bigint
  readonly selectedToken: RENEWAL_TOKEN
  readonly accountCreditRaw: Partial<Record<RENEWAL_TOKEN, bigint>>
}): HcaDisplayedDebit => {
  const { fundedRaw, networkFeeRaw, selectedToken, accountCreditRaw } = params
  if (selectedToken === FEE_TOKEN) {
    return {
      usdc: debitRaw(fundedRaw + networkFeeRaw, accountCreditRaw.USDC),
      token: 0n,
    }
  }
  return {
    usdc: debitRaw(networkFeeRaw, accountCreditRaw.USDC),
    token: debitRaw(fundedRaw, accountCreditRaw[selectedToken]),
  }
}

const USDC_DECIMALS = 6

/** What a re-quoted funding prompt takes from the wallet, in each coin's units. */
export const getPromptWalletDebit = (
  prompt: HcaFundingPrompt,
): HcaDisplayedDebit => ({
  usdc: prompt.permitValue,
  token: prompt.token?.permitValue ?? 0n,
})

export type RenewalPaymentDecision = 'proceed' | 'confirm'

/**
 * Whether a re-quoted renewal can be signed on the amount the user confirmed.
 * It can when the wallet pays no more in either coin; otherwise the user has to
 * accept the new amount first. With nothing confirmed, any wallet debit asks.
 */
export const decideRenewalPayment = ({
  confirmed,
  requoted,
}: {
  readonly confirmed: HcaDisplayedDebit | undefined
  readonly requoted: HcaDisplayedDebit
}): RenewalPaymentDecision => {
  const ceiling = confirmed ?? { usdc: 0n, token: 0n }
  return requoted.usdc > ceiling.usdc || requoted.token > ceiling.token
    ? 'confirm'
    : 'proceed'
}

/**
 * The payment screen's figures once a re-quote raised the payment: the
 * prompt's receipt in place of the earlier quote's, and whether the wallet
 * signs a payment approval before the renewal.
 */
export const getUpdatedRenewalFunding = ({
  prompt,
  selectedToken,
  quotedWalletDebitFor,
}: {
  readonly prompt: HcaFundingPrompt
  readonly selectedToken: RENEWAL_TOKEN
  /** The earlier quote's per-coin debit, kept for the coins not chosen. */
  readonly quotedWalletDebitFor: ((symbol: TOKEN_SYMBOL) => number) | undefined
}): RenewalFunding & { readonly needsApproval: boolean } => {
  const usdc = (value: bigint) => decimalBigintToNumber(value, USDC_DECIMALS)
  const { token } = prompt
  const tokenOf = (value: bigint) =>
    token ? decimalBigintToNumber(value, token.decimals) : 0
  const usdcCredit =
    prompt.requiredUsdc + prompt.quotedFeeUsdc - prompt.permitValue
  const rent = token ? tokenOf(token.required) : usdc(prompt.requiredUsdc)
  const networkFee = usdc(prompt.quotedFeeUsdc)
  const selectedCoinDebit = token
    ? tokenOf(token.permitValue)
    : usdc(prompt.permitValue)
  const walletDebit =
    usdc(prompt.permitValue) + (token ? tokenOf(token.permitValue) : 0)

  return {
    summary: {
      registration: rent,
      networkFee,
      total: rent + networkFee,
      walletDebit,
      hcaCredit:
        usdc(usdcCredit) +
        (token ? tokenOf(token.required - token.permitValue) : 0),
    },
    walletDebitFor: (symbol) =>
      symbol === selectedToken
        ? selectedCoinDebit
        : (quotedWalletDebitFor?.(symbol) ?? walletDebit),
    needsApproval: prompt.requiresPermit || !!token?.requiresPermit,
  }
}
