import {
  formatLeftoverFunds,
  type LeftoverFund,
} from '@/features/wallet/service/leftoverFunds'

/** The smart account's USDC as the dashboard sees it. */
export type LeftoverFundsRead = {
  readonly isDeployed: boolean
  readonly funds: readonly LeftoverFund[]
  /** A registration stored in this browser that still needs the funds. */
  readonly heldForRegistration?: string | null
}

/**
 * `hidden` until a positive balance is known; `funds` can be withdrawn from
 * here; `held` names the registration that has to finish first.
 */
export type LeftoverFundsNotice =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'funds'; readonly amount: string }
  | {
      readonly kind: 'held'
      readonly amount: string
      readonly registrationName: string
    }

/**
 * What the dashboard says about the smart account's leftover balance. Most
 * accounts hold none, and a failed read must not look like an empty one, so
 * both stay hidden rather than showing a zero.
 */
export const resolveLeftoverFundsNotice = (params: {
  readonly leftover: LeftoverFundsRead | undefined
  readonly isError: boolean
}): LeftoverFundsNotice => {
  const { leftover, isError } = params
  if (isError || !leftover || leftover.funds.length === 0) {
    return { kind: 'hidden' }
  }
  const amount = formatLeftoverFunds(leftover.funds)
  return leftover.heldForRegistration
    ? { kind: 'held', amount, registrationName: leftover.heldForRegistration }
    : { kind: 'funds', amount }
}
