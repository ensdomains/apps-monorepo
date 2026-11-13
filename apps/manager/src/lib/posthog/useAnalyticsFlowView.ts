import { useAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { useAnalyticsView } from '@ens-apps/utils/posthog/useAnalyticsView'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useCallback, useEffect, useRef } from 'react'
import { useConnection } from 'wagmi'
import { track } from './events'
import { type AnalyticsView, getFlowViewEvents } from './flowView'

export type { AnalyticsView } from './flowView'

type ViewActor<Snapshot> = {
  readonly getSnapshot: () => Snapshot
  readonly subscribe: (listener: () => void) => {
    readonly unsubscribe: () => void
  }
}

/** The actor adapter retains synchronous milestones; readiness is shared with other views. */
export const useAnalyticsFlowView = <Snapshot>(
  actor: ViewActor<Snapshot>,
  getView: (snapshot: Snapshot) => AnalyticsView | undefined,
): void => {
  const consent = useAnalyticsConsent(posthog)
  const { address, status } = useConnection()
  const previous =
    useRef<ReturnType<typeof getFlowViewEvents>['observation']>(undefined)
  useEffect(() => {
    if (consent !== 'granted') previous.current = undefined
  }, [consent])
  const observe = useCallback(
    (identity: string) => {
      const result = getFlowViewEvents(
        previous.current,
        getView(actor.getSnapshot()),
        identity,
      )
      for (const event of result.events) track(event.name, event.properties)
      previous.current = result.observation
    },
    [actor, getView],
  )
  const subscribe = useCallback(
    (listener: () => void) => actor.subscribe(listener),
    [actor],
  )
  useAnalyticsView(
    posthog,
    status === 'disconnected' ? null : address,
    true,
    observe,
    subscribe,
  )
}
