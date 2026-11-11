import type { createAnalyticsTracker } from './createAnalyticsTracker'
import type { AnalyticsEvents } from './eventContracts'
import { createAnalyticsFlowId } from './flowId'

type Capture = ReturnType<typeof createAnalyticsTracker>['track']
type SaveType = AnalyticsEvents['profile:save_complete']['save_type']
type FailureStage = AnalyticsEvents['profile:save_fail']['stage']

const safeCapture =
  (capture: Capture): Capture =>
  (name, ...args) => {
    try {
      void Promise.resolve(capture(name, ...args)).catch(() => {})
    } catch {
      // Optional telemetry cannot interrupt editing or saving.
    }
  }

export type ProfileSaveAttempt = {
  readonly flow_id: string
  readonly capture: Capture
  readonly fail: (stage: FailureStage) => void
  readonly complete: () => void
}

/** One editor session; write outcomes stay with the async operation, not its mounted UI. */
export const createProfileEditingAnalytics = ({
  track,
  startOperation,
  createFlowId = createAnalyticsFlowId,
}: {
  readonly track: Capture
  readonly startOperation: () => { readonly capture: Capture }
  readonly createFlowId?: () => string | undefined
}) => {
  const send = safeCapture(track)
  let session:
    | {
        readonly flow_id: string
        readonly hasEdited: boolean
        readonly observedIdentity?: string
      }
    | undefined

  const open = (): void => {
    try {
      const flowId = createFlowId()
      session = flowId ? { flow_id: flowId, hasEdited: false } : undefined
    } catch {
      session = undefined
    }
  }
  const view = (identity = ''): void => {
    if (!session || session.observedIdentity === identity) return
    if (session.observedIdentity !== undefined) open()
    if (!session) return
    session = { ...session, observedIdentity: identity, hasEdited: false }
    send('profile:edit_view', { flow_id: session.flow_id })
  }
  const change = (): void => {
    if (!session || session.observedIdentity === undefined || session.hasEdited)
      return
    session = { ...session, hasEdited: true }
    send('profile:edit_start', { flow_id: session.flow_id })
  }
  const startSave = (
    chainId: number,
    saveType: SaveType,
  ): ProfileSaveAttempt => {
    const properties = { flow_id: session?.flow_id ?? '', chain_id: chainId }
    const bind = (): Capture => {
      try {
        return safeCapture(startOperation().capture)
      } catch {
        return () => {}
      }
    }
    const capture = bind()
    const emit: Capture = session ? capture : () => {}
    emit('profile:save_start', properties)
    let isSettled = false
    return {
      flow_id: properties.flow_id,
      capture,
      fail: (stage) => {
        if (isSettled) return
        isSettled = true
        emit('profile:save_fail', {
          ...properties,
          stage,
          is_retryable: true,
        })
      },
      complete: () => {
        if (isSettled) return
        isSettled = true
        emit('profile:save_complete', { ...properties, save_type: saveType })
      },
    }
  }
  return { open, view, change, startSave }
}
