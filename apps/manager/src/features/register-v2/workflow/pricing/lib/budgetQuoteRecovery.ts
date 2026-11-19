import {
  findHcaBudgetUnquotedError,
  type HcaBudgetFailureKind,
} from '@ens-apps/smart-account'

/** Display-only recovery; payment stays blocked until a real quote succeeds. */
export type BudgetQuoteRecovery = {
  readonly kind: HcaBudgetFailureKind
  /** On a gas-coverage refusal, the name price we read on-chain; the fallback fees are never shown. */
  readonly registrationPriceRaw: bigint | null
}

/** Recover the failure kind, and the name price on a gas-coverage refusal, from a wrapped budget error. */
export function getBudgetQuoteRecovery(error: unknown): BudgetQuoteRecovery {
  const unquoted = findHcaBudgetUnquotedError(error)
  if (unquoted?.kind !== 'gas-coverage') {
    return { kind: 'generic', registrationPriceRaw: null }
  }
  return {
    kind: 'gas-coverage',
    registrationPriceRaw: unquoted.breakdown.registrationPrice,
  }
}

/** Derive failed-quote display state without relaxing the payment guard. */
export function getBudgetQuoteFailureUi(params: {
  readonly hasFailed: boolean
  readonly error: unknown
}): {
  readonly failureKind: HcaBudgetFailureKind | null
  readonly registrationPriceRaw: bigint | null
} {
  if (!params.hasFailed) {
    return { failureKind: null, registrationPriceRaw: null }
  }
  const recovery = getBudgetQuoteRecovery(params.error)
  return {
    failureKind: recovery.kind,
    registrationPriceRaw: recovery.registrationPriceRaw,
  }
}

/** The receipt's "Registration total" line, never You pay: the page's total once known, else a gas refusal's name price. */
export const getRegistrationTotalRaw = ({
  pageTotalRaw,
  refusedPriceRaw,
}: {
  readonly pageTotalRaw: bigint | undefined
  /** Non-null only after a gas-coverage refusal. */
  readonly refusedPriceRaw: bigint | null
}): bigint | undefined => {
  if (pageTotalRaw !== undefined) return pageTotalRaw
  if (refusedPriceRaw === null) return undefined
  return refusedPriceRaw
}
