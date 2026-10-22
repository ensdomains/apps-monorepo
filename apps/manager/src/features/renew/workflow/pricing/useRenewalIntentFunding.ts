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
import { type RENEWAL_TOKEN, type TOKEN_SYMBOL, TOKENS } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'

const USDC_DECIMALS = TOKENS.USDC.decimals

export type RenewalIntentFunding = {
  /** Only the smart-account route pays an intent fee. */
  readonly isIntentRoute: boolean
  readonly isQuoting: boolean
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
  readonly pricing: { readonly funded: number } | undefined
  readonly accountCredit: Partial<Record<TOKEN_SYMBOL, number>>
}): RenewalIntentFunding => {
  const { account, pricing, accountCredit, ...quote } = params
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

  const networkFee =
    feeQuery.data === null || feeQuery.data === undefined
      ? undefined
      : decimalBigintToNumber(feeQuery.data, USDC_DECIMALS)

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

  return {
    isIntentRoute,
    isQuoting: isIntentRoute && feeQuery.isLoading,
    funding: renewalFunding
      ? { ...renewalFunding.summary, isLoading: feeQuery.isFetching }
      : undefined,
    walletDebitFor: renewalFunding?.walletDebitFor,
  }
}
