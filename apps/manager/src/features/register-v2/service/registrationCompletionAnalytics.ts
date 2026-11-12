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

type RegistrationCompletion = {
  readonly properties: Completion['properties']
  readonly complete: () => void
  readonly observe: (
    txId: string,
    verification?: RegistrationVerification,
  ) => void
  readonly withAttempt: (completion: Completion) => RegistrationCompletion
}

const waitForCompletion = async (
  txId: string,
  verification: RegistrationVerification | undefined,
  complete: () => void,
): Promise<void> => {
  const receipt = await pollTransactionStatusActor({ txId })
  if (receipt.isOk()) return complete()
  if (!verification) return
  const result = await (verification.mode === 'hca'
    ? verifyHcaRegistrationActor(verification.input)
    : verifyRegistrationActor(verification.input))
  if (result.isOk() && result.value.verified) complete()
}

/** Rebound attempts share observation/once guards, never mutable event properties. */
export const createRegistrationCompletion = (
  completion: Completion,
  previous?: RegistrationCompletion,
): RegistrationCompletion => {
  if (previous?.properties.flow_id === completion.properties.flow_id)
    return previous.withAttempt(completion)
  const receipts = new WeakSet<object>()
  const verifications = new WeakSet<object>()
  const bind = ({
    analytics,
    properties,
  }: Completion): RegistrationCompletion => {
    const complete = (): void => {
      if (analytics.claimCompletion())
        analytics.capture('registration:flow_complete', properties)
    }
    const observe = (
      txId: string,
      verification?: RegistrationVerification,
    ): void => {
      const run = async () => {
        const transaction = transactionManager.getTransaction(txId)
        if (!transaction && !verification) return
        const identity = transaction ?? analytics.claimCompletion
        const observations = verification ? verifications : receipts
        if (observations.has(identity)) return
        observations.add(identity)
        await waitForCompletion(txId, verification, complete)
      }
      void run().catch(() => {})
    }
    return { properties, complete, observe, withAttempt: bind }
  }
  return bind(completion)
}
