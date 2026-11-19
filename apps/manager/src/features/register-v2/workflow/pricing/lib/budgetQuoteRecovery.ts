import {
  findHcaBudgetUnquotedError,
  type HcaBudgetFailureKind,
} from '@ens-apps/smart-account'

/** Why a required budget quote failed, for its warning; null while none has. Payment stays blocked either way. */
export function getBudgetQuoteFailureKind(params: {
  readonly hasFailed: boolean
  readonly error: unknown
}): HcaBudgetFailureKind | null {
  if (!params.hasFailed) return null
  return findHcaBudgetUnquotedError(params.error)?.kind ?? 'generic'
}
