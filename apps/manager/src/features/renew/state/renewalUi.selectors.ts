import { match, P } from 'ts-pattern'
import { createRenewalUiSelector } from './renewalUi.context'
import type { RenewalPaymentUpdate } from './renewalUi.machine'

export const useRenewalStep = createRenewalUiSelector((state) =>
  match(state.value)
    .with({ pricing: P.string }, () => 'pricing' as const)
    .with(
      { submittingHcaRenewal: P.string },
      () => 'submittingHcaRenewal' as const,
    )
    .with(P.string, (step) => step)
    .exhaustive(),
)

/**
 * The owner is still approving: the funding prompt and the intent signature on
 * the smart-account route, the allowance check and the approve transaction on
 * the EOA route. The payment dialog stays up meanwhile, as registration's does,
 * and the progress page takes over once the renewal itself is on its way.
 */
export const useIsAwaitingRenewalApproval = createRenewalUiSelector(
  (state) =>
    (state.matches('submittingHcaRenewal') && !state.context.renewalTxId) ||
    state.matches('checkingAllowance') ||
    state.matches('submittingTokenApproval'),
)

/** The updated receipt of the running intent attempt, once its payment went up. */
export const useRenewalPaymentUpdate = createRenewalUiSelector(
  (state): RenewalPaymentUpdate | undefined => {
    if (!state.matches('submittingHcaRenewal')) return undefined
    const update = state.context.paymentUpdate
    if (update) return { status: update.status, prompt: update.prompt }
    return undefined
  },
  (a, b) => a?.status === b?.status && a?.prompt === b?.prompt,
)
