import type { HcaDisplayedDebit } from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { getRenewalFeeQueryOptions } from '@/features/renew/data/queries/renewalFee.query'
import type { HcaRenewalItem } from '@/features/renew/service/hcaRenewal'
import {
  computeRenewalDisplayedDebit,
  computeRenewalFunding,
  type RenewalFunding,
} from '@/features/renew/utils/renewalFunding'
import { getRenewalPaymentRoute } from '@/features/renew/utils/renewalPaymentRoute'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'
import type { SmartAccountContextValue } from '@/lib/smart-account/SmartAccountContext'
import { type RENEWAL_TOKEN, type TOKEN_SYMBOL, TOKENS } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

const USDC_DECIMALS = TOKENS.USDC.decimals

export type RenewalIntentFunding = {
  /** Only the smart-account route pays an intent fee. */
  readonly isIntentRoute: boolean
  readonly isQuoting: boolean
  /** The fee could not be quoted, so the renewal cannot start until a retry succeeds. */
  readonly hasQuoteFailed: boolean
  readonly retryQuote: () => void
  /** Absent until the fee is quoted, or when the quote failed: the rent alone is shown then. */
  readonly funding:
    | (RenewalFunding['summary'] & { readonly isLoading: boolean })
    | undefined
  readonly walletDebitFor: RenewalFunding['walletDebitFor'] | undefined
  /** The shown wallet debit in token units, present exactly when `funding` is. */
  readonly displayedDebit: HcaDisplayedDebit | undefined
  /** The quoted fee in USDC units; absent until quoted, or when the quote failed. */
  readonly feeRaw: bigint | undefined
}

/** The renewal intents' fee, folded with the rent and the account's balance into what the wallet pays. */
export const useRenewalIntentFunding = (params: {
  /** The names renewed: one for a single renewal, the selection for a bulk one. */
  readonly items: readonly HcaRenewalItem[]
  /** False until the fee is worth quoting, such as before the payment step. */
  readonly isEnabled?: boolean
  readonly token: RENEWAL_TOKEN
  readonly protocol: RenewalProtocol
  readonly renewerAddress: Address
  readonly account: Pick<SmartAccountContextValue, 'signer' | 'ownerAddress'>
  readonly pricing:
    | { readonly funded: number; readonly fundedRaw: bigint }
    | undefined
  readonly accountCredit: Partial<Record<TOKEN_SYMBOL, number>>
  readonly accountCreditRaw: Partial<Record<RENEWAL_TOKEN, bigint>>
}): RenewalIntentFunding => {
  const {
    account,
    pricing,
    accountCredit,
    accountCreditRaw,
    isEnabled = true,
    ...quote
  } = params
  const isIntentRoute = getRenewalPaymentRoute(account.signer) === 'intent'

  const feeQuery = useQuery(
    getRenewalFeeQueryOptions({
      ...quote,
      signer:
        isEnabled && isIntentRoute && account.signer?.type === 'rhinestone'
          ? account.signer
          : null,
      ownerAddress: account.ownerAddress ?? null,
    }),
  )

  const networkFeeRaw = feeQuery.data ?? undefined
  const networkFee =
    networkFeeRaw === undefined
      ? undefined
      : decimalBigintToNumber(networkFeeRaw, USDC_DECIMALS)

  // The rent is owed in the chosen coin and the fee in USDC, each net of what
  // the account already holds. Shown as "up to": the rent carries its approval
  // headroom and the fee is an estimate.
  const renewalFunding =
    isIntentRoute && pricing && networkFee !== undefined
      ? computeRenewalFunding({
          funded: pricing.funded,
          networkFee,
          selectedToken: quote.token,
          accountCredit,
        })
      : undefined

  // `null` is a quote the rail refused to price: as unusable as an error.
  const isQuoteUnusable =
    feeQuery.isError || (feeQuery.isSuccess && feeQuery.data === null)

  return {
    isIntentRoute,
    isQuoting:
      isEnabled &&
      isIntentRoute &&
      feeQuery.isFetching &&
      networkFeeRaw === undefined,
    hasQuoteFailed:
      isEnabled && isIntentRoute && isQuoteUnusable && !feeQuery.isFetching,
    retryQuote: () => {
      feeQuery.refetch()
    },
    funding: renewalFunding
      ? { ...renewalFunding.summary, isLoading: feeQuery.isFetching }
      : undefined,
    walletDebitFor: renewalFunding?.walletDebitFor,
    displayedDebit:
      renewalFunding && pricing && networkFeeRaw !== undefined
        ? computeRenewalDisplayedDebit({
            fundedRaw: pricing.fundedRaw,
            networkFeeRaw,
            selectedToken: quote.token,
            accountCreditRaw,
          })
        : undefined,
    feeRaw: networkFeeRaw,
  }
}
