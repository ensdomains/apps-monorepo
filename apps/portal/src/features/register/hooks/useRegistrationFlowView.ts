import { getAnalyticsNameProperties } from '@ens-apps/utils/posthog/nameProperties'
import { useCallback, useRef } from 'react'
import { track } from '@/lib/posthog/events'
import { useAnalyticsScreenView } from '@/lib/posthog/useAnalyticsScreenView'
import {
  getRegistrationFlowViewEvents,
  type RegistrationViewObservation,
} from '../utils/registrationFlowView'

/** Duration and payment share a page; payment is only visible after connecting. */
export const useRegistrationFlowView = ({
  flowId,
  name,
  isVisible,
  isPaymentVisible,
}: {
  readonly name?: string
  readonly flowId: string | undefined
  readonly isVisible: boolean
  readonly isPaymentVisible: boolean
}): void => {
  const previous = useRef<RegistrationViewObservation>(undefined)
  const observe = useCallback(
    (identityKey: string) => {
      if (!flowId) return
      const current = {
        flowId,
        identity: identityKey,
        hasPayment: isPaymentVisible,
      }
      const properties = {
        flow_id: flowId,
        ...getAnalyticsNameProperties(name),
      }
      for (const event of getRegistrationFlowViewEvents(
        previous.current,
        current,
      ))
        track(event, properties)
      previous.current = current
    },
    [flowId, name, isPaymentVisible],
  )
  useAnalyticsScreenView(isVisible, observe)
}
