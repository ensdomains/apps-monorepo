import { authorizedPaymentAmount } from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { getRenewalFeeQueryOptions } from '@/features/renew/data/queries/renewalFee.query'
import {
  computeRenewalFunding,
  type RenewalFunding,
} from '@/features/renew/utils/renewalFunding'
import { getRenewalPaymentRoute } from '@/features/renew/utils/renewalPaymentRoute'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'
import type { SmartAccountContextValue } from '@/lib/smart-account/SmartAccountContext'
import type { RENEWAL_TOKEN } from '@/lib/tokens'

export type RenewalIntentFunding = {
  /** Only the smart-account route pays an intent fee. */
  readonly isIntentRoute: boolean
  readonly isQuoting: boolean
  readonly displayedWalletDebitUsdc: bigint | undefined
  readonly hasQuoteFailed: boolean
  /** Absent until the fee is quoted, or when the quote failed: the rent alone is shown then. */
  readonly funding:
    | (RenewalFunding['summary'] & { readonly isLoading: boolean })
    | undefined
  readonly walletDebitFor: RenewalFunding['walletDebitFor'] | undefined
}

/** The renewal intent's fee, folded with the rent and the account's balance into what the wallet pays. */
export const useRenewalIntentFunding = (params: {
  readonly label: string
  readonly duration: bigint
  readonly token: RENEWAL_TOKEN
  readonly protocol: RenewalProtocol
  readonly renewerAddress: Address
  readonly account: Pick<SmartAccountContextValue, 'signer' | 'ownerAddress'>
  readonly pricing: { readonly rawPrice: bigint } | undefined
  readonly accountCreditRaw: Partial<Record<RENEWAL_TOKEN, bigint>>
}): RenewalIntentFunding => {
  const { account, pricing, accountCreditRaw, ...quote } = params
  const isIntentRoute = getRenewalPaymentRoute(account.signer) === 'intent'

  const feeQuery = useQuery(
    getRenewalFeeQueryOptions({
      ...quote,
      signer:
        isIntentRoute && account.signer?.type === 'rhinestone'
          ? account.signer
          : null,
      ownerAddress: account.ownerAddress ?? null,
    }),
  )

  const networkFee = feeQuery.data
  const renewalFunding =
    isIntentRoute && pricing && networkFee != null
      ? computeRenewalFunding({
          funded: authorizedPaymentAmount(pricing.rawPrice),
          networkFee,
          selectedToken: quote.token,
          accountCredit: accountCreditRaw,
        })
      : undefined

  return {
    isIntentRoute,
    displayedWalletDebitUsdc: renewalFunding?.displayedWalletDebitUsdc,
    hasQuoteFailed:
      isIntentRoute &&
      (feeQuery.isError || (feeQuery.isSuccess && networkFee == null)),
    isQuoting: isIntentRoute && feeQuery.isLoading,
    funding: renewalFunding
      ? {
          ...renewalFunding.summary,
          isLoading: feeQuery.isFetching,
        }
      : undefined,
    walletDebitFor: renewalFunding?.walletDebitFor,
  }
}
