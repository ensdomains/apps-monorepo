import { useCallback, useRef } from 'react'
import { track } from '@/lib/posthog/events'
import { useAnalyticsScreenView } from '@/lib/posthog/useAnalyticsScreenView'
import type { RenewalView } from '../utils/renewalAnalytics'

const SCREEN_EVENTS = {
  disclaimer: undefined,
  settings: 'renewal:duration_view',
  confirm: 'renewal:payment_view',
  summary: 'renewal:payment_view',
} as const

export const useRenewalFlowView = (
  view: RenewalView | undefined,
  isOpen: boolean,
  step: keyof typeof SCREEN_EVENTS,
): void => {
  const previous = useRef<{ readonly key: string; readonly step: string }>(
    undefined,
  )
  const {
    flow_id,
    ens_name,
    protocol_version,
    is_bulk,
    v1_item_count,
    v2_item_count,
  } = view ?? {}
  const observe = useCallback(
    (identityKey: string) => {
      if (!flow_id) return
      const key = `${flow_id}:${identityKey}`
      const isSameFlow = previous.current?.key === key
      if (isSameFlow && previous.current?.step === step) return
      const properties = {
        flow_id,
        ...(ens_name ? { ens_name } : {}),
        protocol_version,
        is_bulk,
        v1_item_count,
        v2_item_count,
      }
      if (!isSameFlow) track('renewal:flow_view', properties)
      const event = SCREEN_EVENTS[step]
      if (event) track(event, properties)
      previous.current = { key, step }
    },
    [
      step,
      flow_id,
      ens_name,
      protocol_version,
      is_bulk,
      v1_item_count,
      v2_item_count,
    ],
  )
  useAnalyticsScreenView(isOpen, observe)
}
