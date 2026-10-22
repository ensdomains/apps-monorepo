import { match, P } from 'ts-pattern'
import { createRenewalUiSelector } from './renewalUi.context'

export const useRenewalStep = createRenewalUiSelector((state) =>
  match(state.value)
    .with({ pricing: P.string }, () => 'pricing' as const)
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
