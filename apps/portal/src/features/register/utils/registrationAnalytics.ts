import type { RegistrationStep } from '@ens-apps/utils/posthog/eventContracts'
import { startAnalyticsOperation } from '@/lib/posthog/events'

const REGISTRATION_STEPS: Readonly<Record<string, RegistrationStep>> = {
  checkingResolver: 'setup',
  deployingResolver: 'setup',
  waitingForResolverDeployment: 'setup',
  preparingCommitment: 'commit',
  committingTransaction: 'commit',
  submittingEoaSetupBundle: 'setup',
  waitingForCommitment: 'commit',
  fetchingCommitmentAge: 'cooldown',
  validatingCommitment: 'commit',
  commitmentCooldown: 'cooldown',
  checkingAllowance: 'approval',
  approvingToken: 'approval',
  waitingForApproval: 'approval',
  registeringDomain: 'registration',
  waitingForRegistration: 'registration',
  verifyingRegistration: 'verification',
}

/** Groups only user-meaningful stages; background state changes share a step. */
export const getRegistrationAnalyticsStep = (
  state: unknown,
): RegistrationStep | undefined =>
  typeof state === 'string' ? REGISTRATION_STEPS[state] : undefined

/** Observes one explicit user run; retry failures remain recoverable step results. */
export const createRegistrationAnalytics = (
  chainId: number,
  operation = startAnalyticsOperation(),
) => {
  const properties = {
    flow_id: crypto.randomUUID(),
    execution_method: 'eoa' as const,
    chain_id: chainId,
  }
  let previousState: unknown
  let currentStep: RegistrationStep | undefined
  let isComplete = false

  const completeStep = () => {
    if (!currentStep) return
    operation.capture('registration:step_result', {
      ...properties,
      step: currentStep,
      outcome: 'success',
      is_retryable: false,
    })
  }
  const complete = () => {
    isComplete = true
    completeStep()
    operation.capture('registration:flow_complete', properties)
  }
  const fail = (isRetryable: boolean) => {
    if (!currentStep) return
    operation.capture('registration:step_result', {
      ...properties,
      step: currentStep,
      outcome: 'failure',
      error_code: 'transaction_failed',
      is_retryable: isRetryable,
    })
  }

  return {
    start: (isResume: boolean) =>
      operation.capture(
        isResume ? 'registration:flow_resume' : 'registration:flow_start',
        properties,
      ),
    retry: () => operation.capture('registration:flow_retry', properties),
    observe: (snapshot: {
      readonly value: unknown
      readonly context: { readonly retryTarget?: unknown }
    }) => {
      if (isComplete || snapshot.value === previousState) return
      const wasFailure = previousState === 'error'
      previousState = snapshot.value
      if (snapshot.value === 'success') return complete()
      if (snapshot.value === 'error')
        return fail(Boolean(snapshot.context.retryTarget))
      const step = getRegistrationAnalyticsStep(snapshot.value)
      if (!step || (step === currentStep && !wasFailure)) return
      if (!wasFailure) completeStep()
      currentStep = step
      operation.capture('registration:step_view', { ...properties, step })
    },
  }
}
