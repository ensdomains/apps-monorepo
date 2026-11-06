import { useAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useEffect } from 'react'
import { getAnalyticsReadyKey } from './flow'

type AnalyticsReadyActor = {
  readonly send: (event: {
    readonly type: 'analytics.ready'
    readonly readyKey: string
  }) => void
}

/** Observe the current idle surface after consent and provider identity effects settle. */
export const useAnalyticsFlowReady = (actor: AnalyticsReadyActor): void => {
  const consent = useAnalyticsConsent(posthog)
  useEffect(() => {
    if (consent !== 'granted') return
    let isCurrent = true
    queueMicrotask(() => {
      const readyKey = getAnalyticsReadyKey()
      if (isCurrent && readyKey)
        actor.send({ type: 'analytics.ready', readyKey })
    })
    return () => {
      isCurrent = false
    }
  }, [actor, consent])
}
