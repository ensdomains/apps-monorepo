import { useAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { hasMatchingWalletIdentity } from '@ens-apps/utils/posthog/walletIdentity'
import posthog from 'posthog-js/dist/module.full.no-external'
import { useCallback, useEffect, useRef } from 'react'
import { useConnection } from 'wagmi'
import { track } from './events'

export type AnalyticsView = {
  readonly flow_id: string
} & (
  | {
      readonly flow: 'registration' | 'renewal'
      readonly step: 'duration' | 'payment'
    }
  | { readonly flow: 'migration'; readonly step?: undefined }
)

type ViewActor<Snapshot> = {
  readonly getSnapshot: () => Snapshot
  readonly subscribe: (listener: () => void) => {
    readonly unsubscribe: () => void
  }
}

const captureView = (
  view: AnalyticsView,
  shouldCaptureFlow: boolean,
  shouldCaptureStep: boolean,
): void => {
  const properties = { flow_id: view.flow_id }
  switch (view.flow) {
    case 'registration':
      if (shouldCaptureFlow) track('registration:flow_view', properties)
      if (shouldCaptureStep)
        track('registration:step_view', { ...properties, step: view.step })
      return
    case 'renewal':
      if (shouldCaptureFlow) track('renewal:flow_view', properties)
      if (shouldCaptureStep)
        track('renewal:step_view', { ...properties, step: view.step })
      return
    case 'migration':
      if (shouldCaptureFlow) track('migration:flow_view', properties)
  }
}

/** Observe current idle UI after provider identity effects settle, without replaying history. */
export const useAnalyticsFlowView = <Snapshot>(
  actor: ViewActor<Snapshot>,
  getView: (snapshot: Snapshot) => AnalyticsView | undefined,
): void => {
  const consent = useAnalyticsConsent(posthog)
  const { address, status } = useConnection()
  const previousFlow = useRef<string | undefined>(undefined)
  const previousStep = useRef<string | undefined>(undefined)
  const observe = useCallback(() => {
    try {
      const view = getView(actor.getSnapshot())
      if (!view) {
        previousStep.current = undefined
        return
      }
      const identity = posthog.get_distinct_id()
      const wallet = status === 'disconnected' ? null : address
      if (!hasMatchingWalletIdentity(wallet, identity)) return
      const flowKey = `${identity}:${view.flow_id}`
      const stepKey = `${flowKey}:${view.step}`
      captureView(
        view,
        previousFlow.current !== flowKey,
        previousStep.current !== stepKey,
      )
      previousFlow.current = flowKey
      previousStep.current = stepKey
    } catch {
      // Optional analytics cannot interrupt actor notifications or rendering.
    }
  }, [actor, getView, address, status])
  useEffect(() => {
    if (consent !== 'granted') {
      previousFlow.current = undefined
      previousStep.current = undefined
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
