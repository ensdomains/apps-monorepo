import type {
  HcaDisplayedDebit,
  HcaFundingPrompt,
} from '@ens-apps/transaction-manager'
import { formatUnits, parseUnits } from 'viem'
import type { RENEWAL_TOKEN, TOKEN_SYMBOL } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

/** The price is paid in the chosen coin; the intent's fee is always USDC. */
const FEE_TOKEN: TOKEN_SYMBOL = 'USDC'

export type RenewalFundingSummary = {
  /** The price with its approval headroom: what the renewer may pull. */
  readonly registration: number
  readonly networkFee: number
  /** Price with headroom plus the fee: the figure shown as "up to". */
  readonly total: number
  /** What the wallet covers across both coins after the account's own balances. */
  readonly walletDebit: number
  /** The account balances the renewal uses, across both coins. */
  readonly hcaCredit: number
}

export type RenewalFunding = {
  readonly summary: RenewalFundingSummary
  /** What the wallet must cover in `symbol` if it pays the price: the fee only counts against USDC. */
  readonly walletDebitFor: (symbol: TOKEN_SYMBOL) => number
}

type Leg = readonly [symbol: TOKEN_SYMBOL, amount: number]

/**
 * What a smart-account renewal needs from the wallet. The price (with its
 * headroom) is owed in the chosen coin and the fee in USDC, and the account's
 * own balance of each pays first.
 */
export const computeRenewalFunding = (params: {
  /** The price with its approval headroom, in the chosen coin. */
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

  // Were `symbol` the chosen coin, it would owe the price, plus the fee if it is USDC.
  const walletDebitFor = (symbol: TOKEN_SYMBOL) =>
    debitOf([symbol, funded + (symbol === FEE_TOKEN ? networkFee : 0)])

  // The headline covers both coins: the price in the chosen one, the fee in USDC.
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
  /** The price with its approval headroom, in the chosen coin's units. */
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

/** `raw` rounded up to a whole cent, as an "up to" receipt shows it. */
const toCentCeiling = (raw: bigint, decimals: number): bigint => {
  const cent = 10n ** BigInt(Math.max(decimals - 2, 0))
  return ((raw + cent - 1n) / cent) * cent
}

/**
 * Whether a re-quoted renewal can be signed on the amount the user confirmed.
 * It can when the wallet pays no more, in either coin, than the cent the receipt
 * showed; otherwise the user has to accept the new amount first. With nothing
 * confirmed, any wallet debit asks.
 */
export const decideRenewalPayment = ({
  confirmed,
  requoted,
  tokenDecimals,
}: {
  readonly confirmed: HcaDisplayedDebit | undefined
  readonly requoted: HcaDisplayedDebit
  /** The rent token's decimals; USDC has 6. */
  readonly tokenDecimals: number
}): RenewalPaymentDecision => {
  const ceiling = confirmed ?? { usdc: 0n, token: 0n }
  const isUsdcHigher =
    toCentCeiling(requoted.usdc, 6) > toCentCeiling(ceiling.usdc, 6)
  const isTokenHigher =
    toCentCeiling(requoted.token, tokenDecimals) >
    toCentCeiling(ceiling.token, tokenDecimals)
  return isUsdcHigher || isTokenHigher ? 'confirm' : 'proceed'
}

/**
 * The payment screen's figures once a re-quote raised the payment: the
 * prompt's receipt in place of the earlier quote's, and whether the wallet
 * signs a payment approval before the renewal.
 */
const getUpdatedRenewalFunding = ({
  prompt,
  selectedToken,
  quotedWalletDebitFor,
}: {
  readonly prompt: HcaFundingPrompt
  readonly selectedToken: RENEWAL_TOKEN
  /** The earlier quote's per-coin debit, kept for the coins not chosen. */
  readonly quotedWalletDebitFor: ((symbol: TOKEN_SYMBOL) => number) | undefined
}): RenewalFunding & { readonly isApprovalRequired: boolean } => {
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
    isApprovalRequired: prompt.requiresPermit || !!token?.requiresPermit,
  }
}

type ScreenQuote = {
  readonly funding:
    | (RenewalFundingSummary & { readonly isLoading: boolean })
    | undefined
  readonly walletDebitFor: ((symbol: TOKEN_SYMBOL) => number) | undefined
  readonly isQuoting: boolean
  readonly hasQuoteFailed: boolean
}

/**
 * What the payment screen shows: the live quote, or, once an attempt's
 * payment went up, that attempt's own prompt. The prompt is what the wallet
 * will be asked for, so the live quote's loading or failure never replaces it.
 */
export const getRenewalPaymentScreen = ({
  prompt,
  selectedToken,
  quote,
}: {
  readonly prompt: HcaFundingPrompt | undefined
  readonly selectedToken: RENEWAL_TOKEN
  readonly quote: ScreenQuote
}): ScreenQuote & { readonly isApprovalRequired: boolean } => {
  if (!prompt) return { ...quote, isApprovalRequired: false }
  const updated = getUpdatedRenewalFunding({
    prompt,
    selectedToken,
    quotedWalletDebitFor: quote.walletDebitFor,
  })
  return {
    funding: { ...updated.summary, isLoading: false },
    walletDebitFor: updated.walletDebitFor,
    isQuoting: false,
    hasQuoteFailed: false,
    isApprovalRequired: updated.isApprovalRequired,
  }
}

/**
 * Where the renewal fee quote stands. A quote the rail refused to price (`null`)
 * is as unusable as an error, and neither counts as failed while a retry runs.
 */
export const getRenewalFeeQuoteState = (quote: {
  /** The quote applies: the payment step is open on the smart-account route. */
  readonly isActive: boolean
  readonly isFetching: boolean
  readonly isError: boolean
  /** The fee in USDC units; `null` once the rail refused to price it. */
  readonly feeRaw: bigint | null | undefined
}): { readonly isQuoting: boolean; readonly hasQuoteFailed: boolean } => ({
  isQuoting: quote.isActive && quote.isFetching && quote.feeRaw == null,
  hasQuoteFailed:
    quote.isActive &&
    !quote.isFetching &&
    (quote.isError || quote.feeRaw === null),
})

const RECEIPT_DECIMALS = 6

/** The price less the balance applied up to it, in the receipt's USDC units. */
const toReceiptTotalRaw = (
  fundedRaw: bigint,
  balanceRaw: bigint,
  decimals: number,
): bigint =>
  parseUnits(
    formatUnits(
      fundedRaw - (balanceRaw < fundedRaw ? balanceRaw : fundedRaw),
      decimals,
    ),
    RECEIPT_DECIMALS,
  )

/** The receipt's renewal total: the price with its headroom, less the account's balance of that coin. */
export const getRenewalCheckoutTotalRaw = ({
  fundedRaw,
  accountBalanceRaw,
  decimals,
}: {
  readonly fundedRaw: bigint | undefined
  readonly accountBalanceRaw: bigint | undefined
  /** The price's coin. */
  readonly decimals: number
}): bigint | undefined =>
  fundedRaw === undefined || accountBalanceRaw === undefined
    ? undefined
    : toReceiptTotalRaw(fundedRaw, accountBalanceRaw, decimals)

/** The review's renewal total, from the prompt the wallet will be asked for. */
const getPromptCheckoutTotalRaw = (prompt: HcaFundingPrompt): bigint =>
  prompt.token
    ? toReceiptTotalRaw(
        prompt.token.required,
        prompt.token.hcaBalance,
        prompt.token.decimals,
      )
    : toReceiptTotalRaw(
        prompt.requiredUsdc,
        prompt.hcaBalanceUsdc,
        RECEIPT_DECIMALS,
      )

/** The sheet's renewal total: an increased amount's own prompt once there is one, else the live price and balance. */
export const getRenewalReceiptTotalRaw = ({
  prompt,
  ...checkout
}: Parameters<typeof getRenewalCheckoutTotalRaw>[0] & {
  readonly prompt: HcaFundingPrompt | undefined
}): bigint | undefined =>
  prompt
    ? getPromptCheckoutTotalRaw(prompt)
    : getRenewalCheckoutTotalRaw(checkout)

/** On the intent route the sheet confirms only a receipt that shows its total, which needs the account's balance. */
export const isRenewalReceiptReady = ({
  isIntentRoute,
  checkoutTotalRaw,
}: {
  readonly isIntentRoute: boolean
  readonly checkoutTotalRaw: bigint | undefined
}): boolean => !isIntentRoute || checkoutTotalRaw !== undefined
