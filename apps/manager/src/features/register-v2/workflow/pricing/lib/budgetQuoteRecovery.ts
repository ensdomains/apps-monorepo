import {
  findHcaBudgetUnquotedError,
  type HcaBudgetFailureKind,
} from '@ens-apps/smart-account'
import {
  computeRegistrationFunding,
  type RegistrationFunding,
} from './registrationFunding'

const USDC_DECIMALS = 6

/** Display-only recovery; payment stays blocked until a real quote succeeds. */
export type BudgetQuoteRecovery = {
  readonly kind: HcaBudgetFailureKind
  readonly estimatedFunding: RegistrationFunding | null
  /** The estimate's registration price in raw USDC, so the receipt total matches its fee and debit. */
  readonly estimatedRegistrationRaw: bigint | null
}

/** Failure-copy variants mapped to Lingui messages by the component. */
export type BudgetQuoteFailureCopy =
  | {
      readonly variant: 'gas-coverage-with-estimate'
      readonly estimatedTotalLabel: string
    }
  | { readonly variant: 'gas-coverage' }
  | { readonly variant: 'generic' }

/** Recover the failure kind and display estimate from a wrapped budget error. */
export function getBudgetQuoteRecovery(error: unknown): BudgetQuoteRecovery {
  const unquoted = findHcaBudgetUnquotedError(error)
  if (!unquoted) {
    return {
      kind: 'generic',
      estimatedFunding: null,
      estimatedRegistrationRaw: null,
    }
  }

  return {
    kind: unquoted.kind,
    estimatedFunding: computeRegistrationFunding({
      budget: unquoted.breakdown,
      decimals: USDC_DECIMALS,
    }),
    estimatedRegistrationRaw: unquoted.breakdown.registrationPrice,
  }
}

/** Pick the failure-copy variant from the recovery and a formatted total. */
export function getBudgetQuoteFailureCopy(params: {
  readonly recovery: Pick<BudgetQuoteRecovery, 'kind'> | null
  readonly estimatedTotalLabel: string | null
}): BudgetQuoteFailureCopy {
  if (
    params.recovery?.kind === 'gas-coverage' &&
    params.estimatedTotalLabel !== null
  ) {
    return {
      variant: 'gas-coverage-with-estimate',
      estimatedTotalLabel: params.estimatedTotalLabel,
    }
  }
  if (params.recovery?.kind === 'gas-coverage') {
    return { variant: 'gas-coverage' }
  }
  return { variant: 'generic' }
}

/** Derive failed-quote display state without relaxing the payment guard. */
export function getBudgetQuoteFailureUi(params: {
  readonly hasFailed: boolean
  readonly error: unknown
  readonly formatTotal: (total: number) => string
}): {
  readonly estimatedFunding: RegistrationFunding | null
  readonly estimatedRegistrationRaw: bigint | null
  readonly failureCopy: BudgetQuoteFailureCopy | null
  /** True when the receipt should explain the figures are estimates. */
  readonly shouldShowEstimateNotice: boolean
} {
  if (!params.hasFailed) {
    return {
      estimatedFunding: null,
      estimatedRegistrationRaw: null,
      failureCopy: null,
      shouldShowEstimateNotice: false,
    }
  }
  const recovery = getBudgetQuoteRecovery(params.error)
  return {
    estimatedFunding: recovery.estimatedFunding,
    estimatedRegistrationRaw: recovery.estimatedRegistrationRaw,
    failureCopy: getBudgetQuoteFailureCopy({
      recovery,
      estimatedTotalLabel: recovery.estimatedFunding
        ? params.formatTotal(recovery.estimatedFunding.total)
        : null,
    }),
    shouldShowEstimateNotice: recovery.estimatedFunding !== null,
  }
}

/** The receipt total: on a failed quote, the estimate's price when there is one, never a mix with the last quote. */
export const getCheckoutReceiptTotalRaw = ({
  hasBudgetQuoteFailed,
  estimatedRegistrationRaw,
  totalRaw,
}: {
  readonly hasBudgetQuoteFailed: boolean
  readonly estimatedRegistrationRaw: bigint | null
  readonly totalRaw: bigint | undefined
}): bigint | undefined =>
  hasBudgetQuoteFailed && estimatedRegistrationRaw !== null
    ? estimatedRegistrationRaw
    : totalRaw
