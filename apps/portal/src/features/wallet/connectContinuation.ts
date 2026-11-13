import { match } from 'ts-pattern'

export type ConnectContinuationResult = 'connected' | 'cancelled'

type ActiveRequest = {
  readonly requestId: number
  readonly surface: 'mounted' | 'closed'
}

export type ConnectContinuationState =
  | { readonly status: 'idle' }
  | (ActiveRequest & {
      readonly status: 'waiting'
      readonly attempt: 'idle' | 'pending' | 'succeeded'
      readonly isConnected: boolean
    })
  | (ActiveRequest & {
      readonly status: 'settling'
      readonly result: ConnectContinuationResult
    })
  | {
      readonly status: 'ready'
      readonly requestId: number
      readonly result: ConnectContinuationResult
    }

export type ConnectContinuationEvent =
  | {
      readonly type: 'open'
      readonly requestId: number
      readonly hasPendingAttempt?: boolean
    }
  | { readonly type: 'reset' }
  | {
      readonly type:
        | 'surface-opened'
        | 'surface-closed'
        | 'attempt-started'
        | 'attempt-succeeded'
        | 'attempt-failed'
        | 'connected'
        | 'dismissed'
      readonly requestId: number
    }

export const INITIAL_CONNECT_CONTINUATION: ConnectContinuationState = {
  status: 'idle',
}

const settle = (
  state: ActiveRequest,
  result: ConnectContinuationResult,
): ConnectContinuationState =>
  state.surface === 'closed'
    ? { status: 'ready', requestId: state.requestId, result }
    : { ...state, status: 'settling', result }

const completeIfConnected = (
  state: Extract<ConnectContinuationState, { status: 'waiting' }>,
): ConnectContinuationState =>
  state.isConnected && state.attempt !== 'pending'
    ? settle(state, 'connected')
    : state

export const connectContinuationReducer = (
  state: ConnectContinuationState,
  event: ConnectContinuationEvent,
): ConnectContinuationState => {
  if (event.type === 'reset') return INITIAL_CONNECT_CONTINUATION
  if (event.type === 'open') {
    return {
      status: 'waiting',
      requestId: event.requestId,
      surface: 'mounted',
      attempt: event.hasPendingAttempt ? 'pending' : 'idle',
      isConnected: false,
    }
  }
  if (
    state.status === 'idle' ||
    event.requestId !== state.requestId ||
    state.status === 'ready'
  )
    return state
  if (event.type === 'surface-closed') {
    return state.status === 'settling'
      ? { status: 'ready', requestId: state.requestId, result: state.result }
      : { ...state, surface: 'closed' }
  }
  if (state.status === 'settling') return state
  return match(event.type)
    .with('surface-opened', () => ({ ...state, surface: 'mounted' }) as const)
    .with('attempt-started', () => ({ ...state, attempt: 'pending' }) as const)
    .with('attempt-succeeded', () =>
      completeIfConnected({ ...state, attempt: 'succeeded' }),
    )
    .with('attempt-failed', () => ({ ...state, attempt: 'idle' }) as const)
    .with('connected', () =>
      completeIfConnected({ ...state, isConnected: true }),
    )
    .with('dismissed', () => settle(state, 'cancelled'))
    .exhaustive()
}
