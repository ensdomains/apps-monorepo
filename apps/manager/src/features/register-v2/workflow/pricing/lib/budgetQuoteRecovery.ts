import {
  findHcaBudgetUnquotedError,
  type HcaBudgetFailureKind,
} from '@ens-apps/smart-account'
import {
  computeRegistrationFunding,
  type RegistrationFunding,
} from './registrationFunding'

const USDC_DECIMALS = 6

/**
 * What checkout can show when the HCA budget query failed.
 *
 * `estimatedFunding` comes from the fallback / mixed breakdown the estimator
 * still produced. It is display-only — payment must stay blocked until a real
 * quote succeeds.
 */
export type BudgetQuoteRecovery = {
  readonly kind: HcaBudgetFailureKind
  readonly estimatedFunding: RegistrationFunding | null
}

/**
 * Which budget-failure copy the sheet should show. The component maps each
 * variant to a Lingui string; keep the decision here so TokenPickerContent
 * does not grow another match arm per case.
 */
export type BudgetQuoteFailureCopy =
  | {
      readonly variant: 'gas-coverage-with-estimate'
      readonly estimatedTotalLabel: string
    }
  | { readonly variant: 'gas-coverage' }
  | { readonly variant: 'generic' }

/**
 * Recover a user-facing kind and optional higher estimate from a budget-query
 * error (and its cause chain).
 */
export function getBudgetQuoteRecovery(error: unknown): BudgetQuoteRecovery {
  const unquoted = findHcaBudgetUnquotedError(error)
  if (!unquoted) {
    return { kind: 'generic', estimatedFunding: null }
  }

  return {
    kind: unquoted.kind,
    estimatedFunding: computeRegistrationFunding({
      budget: unquoted.breakdown,
      decimals: USDC_DECIMALS,
    }),
  }
}

/** Pick the failure-copy variant from the recovery and a formatted total. */
export function getBudgetQuoteFailureCopy(params: {
  readonly recovery: BudgetQuoteRecovery | null
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

/**
 * Everything the payment sheet needs from a failed (or successful) budget
 * query. One call so the component does not branch on the failure twice.
 */
export function getBudgetQuoteFailureUi(params: {
  readonly hasFailed: boolean
  readonly error: unknown
  readonly formatTotal: (total: number) => string
}): {
  readonly estimatedFunding: RegistrationFunding | null
  readonly failureCopy: BudgetQuoteFailureCopy | null
  /** True when the receipt should explain the figures are estimates. */
  readonly showEstimateNotice: boolean
} {
  if (!params.hasFailed) {
    return {
      estimatedFunding: null,
      failureCopy: null,
      showEstimateNotice: false,
    }
  }
  const recovery = getBudgetQuoteRecovery(params.error)
  return {
    estimatedFunding: recovery.estimatedFunding,
    failureCopy: getBudgetQuoteFailureCopy({
      recovery,
      estimatedTotalLabel: recovery.estimatedFunding
        ? params.formatTotal(recovery.estimatedFunding.total)
        : null,
    }),
    showEstimateNotice: recovery.estimatedFunding !== null,
  }
}
