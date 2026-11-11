import { useCallback, useRef } from 'react'
import { track } from '@/lib/posthog/events'
import { useAnalyticsScreenView } from '@/lib/posthog/useAnalyticsScreenView'

/** Duration and payment share a page; payment is only visible after connecting. */
export const useRegistrationFlowView = ({
  flowId,
  isVisible,
  isPaymentVisible,
}: {
  readonly flowId: string | undefined
  readonly isVisible: boolean
  readonly isPaymentVisible: boolean
}): void => {
  const previous = useRef<{
    readonly key: string
    readonly hasPayment: boolean
  }>(undefined)
  const observe = useCallback(
    (identityKey: string) => {
      if (!flowId) return
      const key = `${flowId}:${identityKey}`
      const isSameFlow = previous.current?.key === key
      const properties = { flow_id: flowId }
      if (!isSameFlow) {
        track('registration:flow_view', properties)
        track('registration:duration_view', properties)
      }
      const shouldViewPayment =
        isPaymentVisible && (!isSameFlow || !previous.current?.hasPayment)
      if (shouldViewPayment) track('registration:payment_view', properties)
      previous.current = { key, hasPayment: isPaymentVisible }
    },
    [flowId, isPaymentVisible],
  )
  useAnalyticsScreenView(isVisible, observe)
}
