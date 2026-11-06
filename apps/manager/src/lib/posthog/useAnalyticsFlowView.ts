import { useAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { hasMatchingWalletIdentity } from '@ens-apps/utils/posthog/walletIdentity'
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

/** Best-effort screen observations only; no business outcome depends on this subscription. */
export const useAnalyticsFlowView = <Snapshot>(
  actor: ViewActor<Snapshot>,
  getView: (snapshot: Snapshot) => AnalyticsView | undefined,
): void => {
  const consent = useAnalyticsConsent(posthog)
  const { address, status } = useConnection()
  const previous =
    useRef<ReturnType<typeof getFlowViewEvents>['observation']>(undefined)
  const observe = useCallback(() => {
    try {
      const identity = posthog.get_distinct_id()
      const wallet = status === 'disconnected' ? null : address
      if (!hasMatchingWalletIdentity(wallet, identity)) return
      const result = getFlowViewEvents(
        previous.current,
        getView(actor.getSnapshot()),
        identity,
      )
      for (const event of result.events) track(event.name, event.properties)
      previous.current = result.observation
    } catch {
      // Optional observations cannot interrupt actor notifications or rendering.
    }
  }, [actor, getView, address, status])
  useEffect(() => {
    if (consent !== 'granted') {
      previous.current = undefined
      return
    }
    if (status !== 'connected' && status !== 'disconnected') return
    let isCurrent = true
    queueMicrotask(() => {
      if (isCurrent) observe()
    })
    const subscription = actor.subscribe(observe)
    return () => {
      isCurrent = false
      subscription.unsubscribe()
    }
  }, [actor, consent, observe, status])
}
