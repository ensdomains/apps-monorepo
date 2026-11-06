import {
  pollTransactionStatusActor,
  verifyRegistrationActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { verifyHcaRegistrationActor } from '@ens-apps/transaction-manager/machines/registration/registration.hca.actors'
import type { RegistrationVerification } from '@ens-apps/transaction-manager/machines/registration/registration.verification'
import { transactionManager } from '@ens-apps/transaction-manager/providers/transactionManager'
import type { AnalyticsEvents } from '@/lib/posthog/events'
import type { AnalyticsFlow } from '@/lib/posthog/flow'

type Completion = {
  readonly analytics: AnalyticsFlow
  readonly properties: AnalyticsEvents['registration:flow_complete']
}

const completedFlows = new WeakSet<object>()
const observedTransactions = new WeakMap<
  object,
  {
    readonly receipts: WeakSet<object>
    readonly verifications: WeakSet<object>
  }
>()

export const captureRegistrationCompletion = ({
  analytics,
  properties,
}: Completion) => {
  const scope = analytics.completionScope ?? analytics
  if (completedFlows.has(scope)) return
  completedFlows.add(scope)
  analytics.capture('registration:flow_complete', properties)
}

const claimRegistrationObservation = (
  scope: object,
  identity: object,
  hasVerification: boolean,
): boolean => {
  const observed = observedTransactions.get(scope) ?? {
    receipts: new WeakSet<object>(),
    verifications: new WeakSet<object>(),
  }
  const observations = hasVerification
    ? observed.verifications
    : observed.receipts
  if (observations.has(identity)) return false
  observations.add(identity)
  observedTransactions.set(scope, observed)
  return true
}

export const observeRegistrationCompletion = (
  completion: Completion,
  txId: string,
  verification?: RegistrationVerification,
): void => {
  const scope = completion.analytics.completionScope ?? completion.analytics
  const observe = async () => {
    const transaction = transactionManager.getTransaction(txId)
    if (!transaction && !verification) return
    if (
      !claimRegistrationObservation(
        scope,
        transaction ?? scope,
        verification !== undefined,
      )
    )
      return
    const receipt = await pollTransactionStatusActor({ txId })
    if (receipt.isOk()) {
      captureRegistrationCompletion(completion)
      return
    }
    if (!verification) return
    const result = await (verification.mode === 'hca'
      ? verifyHcaRegistrationActor(verification.input)
      : verifyRegistrationActor(verification.input))
    if (result.isOk() && result.value.verified)
      captureRegistrationCompletion(completion)
  }
  void observe().catch(() => {})
}
