import { isUserRejectionError } from '@ens-apps/transaction-manager/errors/transaction.errors'
import { match, P } from 'ts-pattern'
import type { StateValue } from 'xstate'

/** Missing receipts and ambiguous submission errors do not prove a reveal failed. */
export const shouldVerifyRegistrationOutcome = ({
  value,
  context,
}: {
  readonly value: StateValue
  readonly context: {
    readonly hash?: string
    readonly callsId?: string
    readonly error?: unknown
  }
}): boolean => {
  const hasSubmission = Boolean(context.hash || context.callsId)
  return match(value)
    .with({ error: 'reverted' }, () => false)
    .with(
      { error: P.union('preparation', 'validation', 'cancelled') },
      () => hasSubmission,
    )
    .with(
      { error: 'submission' },
      () => hasSubmission || !isUserRejectionError(context.error),
    )
    .otherwise(() => true)
}
