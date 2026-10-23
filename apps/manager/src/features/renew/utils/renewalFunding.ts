import { divCeil } from '@ens-apps/transaction-manager/helpers/math'
import type { PaymentFundingSummary } from '@/features/shared/payment/payment.types'
import { type RENEWAL_TOKEN, type TOKEN_SYMBOL, TOKENS } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { getDisplayedRenewalWalletDebit } from './renewalPaymentConsent'

export type RenewalFunding = {
  readonly summary: PaymentFundingSummary
  readonly displayedWalletDebitUsdc: bigint | undefined
  readonly walletDebitFor: (symbol: TOKEN_SYMBOL) => number
}

export const computeRenewalFunding = ({
  funded,
  networkFee,
  selectedToken,
  accountCredit,
}: {
  readonly funded: bigint
  readonly networkFee: bigint
  readonly selectedToken: RENEWAL_TOKEN
  readonly accountCredit: Partial<Record<TOKEN_SYMBOL, bigint>>
}): RenewalFunding => {
  const rentUnits = 10n ** BigInt(TOKENS[selectedToken].decimals)
  const fundedFor = (symbol: TOKEN_SYMBOL) =>
    divCeil(funded * 10n ** BigInt(TOKENS[symbol].decimals), rentUnits)
  const amountFor = (symbol: TOKEN_SYMBOL) =>
    fundedFor(symbol) + (symbol === 'USDC' ? networkFee : 0n)
  const creditFor = (symbol: TOKEN_SYMBOL, amount: bigint) => {
    const balance = accountCredit[symbol] ?? 0n
    return balance < amount ? balance : amount
  }
  const debitFor = (symbol: TOKEN_SYMBOL) => {
    const amount = amountFor(symbol)
    return amount - creditFor(symbol, amount)
  }
  const display = (symbol: TOKEN_SYMBOL, amount: bigint) =>
    decimalBigintToNumber(amount, TOKENS[symbol].decimals)
  const displayedWalletDebitUsdc =
    selectedToken === 'USDC'
      ? getDisplayedRenewalWalletDebit({
          rent: funded,
          fee: networkFee,
          balance: accountCredit.USDC ?? 0n,
        })
      : undefined
  const rent = display(selectedToken, funded)
  const fee = display('USDC', networkFee)
  const feeCredit =
    selectedToken === 'USDC'
      ? 0
      : display('USDC', creditFor('USDC', networkFee))
  const feeDebit =
    selectedToken === 'USDC'
      ? 0
      : display('USDC', networkFee - creditFor('USDC', networkFee))

  return {
    displayedWalletDebitUsdc,
    summary: {
      registration: rent,
      networkFee: fee,
      total: rent + fee,
      hcaCredit:
        display(
          selectedToken,
          creditFor(selectedToken, amountFor(selectedToken)),
        ) + feeCredit,
      walletDebit:
        displayedWalletDebitUsdc === undefined
          ? display(selectedToken, debitFor(selectedToken)) + feeDebit
          : display('USDC', displayedWalletDebitUsdc),
      isLoading: false,
    },
    walletDebitFor: (symbol) => display(symbol, debitFor(symbol)),
  }
}
