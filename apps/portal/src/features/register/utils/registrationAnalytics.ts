import type { RegistrationMachineActor } from '@ens-apps/transaction-manager'
import { verifyRegistrationActor } from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import type { RegistrationVerification } from '@ens-apps/transaction-manager/machines/registration/registration.verification'
import type { RegistrationStage } from '@ens-apps/utils/posthog/eventContracts'
import { createAnalyticsFlowId } from '@ens-apps/utils/posthog/flowId'
import { getAnalyticsNameProperties } from '@ens-apps/utils/posthog/nameProperties'
import { getRegistrationAnalyticsStep } from '@ens-apps/utils/posthog/registrationStage'
import { match } from 'ts-pattern'
import { startAnalyticsOperation } from '@/lib/posthog/events'
import { observeTransactionReceipt } from '@/utils/observeTransactionReceipt'

type Snapshot = {
  readonly value: unknown
  readonly context: { readonly retryTarget?: unknown }
}

type Observation = {
  readonly previousState: unknown
  readonly stage: RegistrationStage | undefined
}

type Transition = {
  readonly observation: Observation
  readonly event?:
    | { readonly type: 'complete' }
    | { readonly type: 'enter'; readonly stage: RegistrationStage }
    | {
        readonly type: 'fail'
        readonly stage: RegistrationStage
        readonly isRetryable: boolean
      }
}

const getRegistrationTransition = (
  observation: Observation,
  snapshot: Snapshot,
): Transition => {
  if (
    observation.previousState === 'success' ||
    snapshot.value === observation.previousState
  )
    return { observation }
  const next = { ...observation, previousState: snapshot.value }
  if (snapshot.value === 'success')
    return {
      observation: next,
      event: { type: 'complete' },
    }
  if (snapshot.value === 'error' && observation.stage)
    return {
      observation: next,
      event: {
        type: 'fail',
        stage: observation.stage,
        isRetryable: Boolean(snapshot.context.retryTarget),
      },
    }
  const stage =
    typeof snapshot.value === 'string'
      ? getRegistrationAnalyticsStep(snapshot.value)
      : undefined
  if (
    !stage ||
    (stage === observation.stage && observation.previousState !== 'error')
  )
    return { observation: next }
  return {
    observation: { ...next, stage },
    event: { type: 'enter', stage },
  }
}

// Machine success follows a confirmed reveal receipt or verified recovery.
export const createRegistrationAnalytics = (
  chainId: number,
  operation = startAnalyticsOperation(),
  flowId = createAnalyticsFlowId(),
  name?: string,
) => {
  const properties = flowId
    ? {
        flow_id: flowId,
        ...getAnalyticsNameProperties(name),
        execution_method: 'eoa' as const,
        chain_id: chainId,
      }
    : undefined
  let observation: Observation = { previousState: undefined, stage: undefined }

  const complete = () => {
    if (observation.previousState === 'success') return
    observation = { ...observation, previousState: 'success' }
    if (properties) operation.capture('registration:flow_complete', properties)
  }

  const observe = (snapshot: Snapshot) => {
    const transition = getRegistrationTransition(observation, snapshot)
    if (transition.event?.type === 'complete') return complete()
    observation = transition.observation
    if (!properties) return
    match(transition.event)
      .with({ type: 'fail' }, ({ stage, isRetryable }) =>
        operation.capture('registration:stage_fail', {
          ...properties,
          stage,
          is_retryable: isRetryable,
        }),
      )
      .with({ type: 'enter' }, ({ stage }) =>
        operation.capture('registration:stage_enter', { ...properties, stage }),
      )
      .otherwise(() => {})
  }

  return {
    start: (isResume: boolean) => {
      if (!properties) return
      operation.capture(
        isResume ? 'registration:flow_resume' : 'registration:flow_start',
        properties,
      )
    },
    retry: () => {
      if (properties) operation.capture('registration:flow_retry', properties)
    },
    observe,
    complete,
  }
}

// Subscribe before START/RESUME, so synchronous stage transitions belong to the run.
export const subscribeRegistrationAnalytics = (
  actor: Pick<RegistrationMachineActor, 'subscribe'>,
  analytics: ReturnType<typeof createRegistrationAnalytics>,
) => actor.subscribe(analytics.observe)

// The submission callback owns outcomes even when UI cleanup stops the transaction.
export const observeQueuedRegistrationReceipt = (
  txId: string,
  analytics: ReturnType<typeof createRegistrationAnalytics>,
  verification: RegistrationVerification | undefined,
) => {
  let hasStartedVerification = false
  const verify = () => {
    if (verification?.mode !== 'eoa' || hasStartedVerification) return
    hasStartedVerification = true
    void Promise.resolve()
      .then(() => verifyRegistrationActor(verification.input))
      .then((result) => {
        if (result.isOk() && result.value.verified) analytics.complete()
      })
      .catch(() => {})
  }
  observeTransactionReceipt(
    txId,
    (outcome) => {
      if (outcome.status === 'receipt' && outcome.receipt.status === 'success')
        analytics.complete()
      else verify()
    },
    verify,
  )
}
