import type { HcaDisplayedDebit } from '@ens-apps/transaction-manager'
import { match, P } from 'ts-pattern'
import type { HcaRenewalL2Funding } from '../service/hcaRenewal'
import type { HcaRenewalEthFunding } from '../service/renewalEthSwap'

/** What a started renewal is checked against, and what pays it. */
export type RenewalStartFundingFields = Readonly<{
  displayedDebit?: HcaDisplayedDebit
  l2Funding?: HcaRenewalL2Funding
  ethFunding?: HcaRenewalEthFunding
}>

export type RenewalStartFunding =
  | { readonly status: 'refused' }
  | { readonly status: 'ready'; readonly fields: RenewalStartFundingFields }

const REFUSED: RenewalStartFunding = { status: 'refused' }

/**
 * The intent route signs only against an amount the user was shown: the wallet
 * debit, the L2 charge, or the ETH swap.
 */
export const getRenewalStartFunding = ({
  isIntentRoute,
  displayedDebit,
  l2Funding,
  isPaidWithEth,
  ethFunding,
}: {
  readonly isIntentRoute: boolean
  readonly displayedDebit: HcaDisplayedDebit | undefined
  readonly l2Funding: HcaRenewalL2Funding | undefined
  readonly isPaidWithEth: boolean
  /** `undefined` until the swap's amount is priced. */
  readonly ethFunding: HcaRenewalEthFunding | undefined
}): RenewalStartFunding =>
  match({ isIntentRoute, displayedDebit, l2Funding, isPaidWithEth, ethFunding })
    .returnType<RenewalStartFunding>()
    // The screen showed the L2 charge, so the wallet debit is not passed.
    .with({ l2Funding: P.nonNullable }, ({ l2Funding }) => ({
      status: 'ready',
      fields: { l2Funding },
    }))
    .with({ isPaidWithEth: true, ethFunding: undefined }, () => REFUSED)
    .with({ isIntentRoute: true, displayedDebit: undefined }, () => REFUSED)
    .otherwise(() => ({
      status: 'ready',
      fields: {
        ...(displayedDebit ? { displayedDebit } : {}),
        ...(isPaidWithEth && ethFunding ? { ethFunding } : {}),
      },
    }))
