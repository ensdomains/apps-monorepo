import { match } from 'ts-pattern'

// Tracks dialog-started connections, including the hidden WalletConnect pairing phase.
export type ConnectFlow = 'closed' | 'choosing' | 'pairing' | 'signing-in'

export type ConnectFlowEvent =
  | 'opened'
  | 'dismissed'
  | 'pairing-started'
  | 'pairing-cancelled'
  | 'pairing-failed'
  | 'connected'
  | 'reconnected'
  | 'disconnected'
  | 'finished'

const isAwaitingConnection = (flow: ConnectFlow) =>
  flow === 'choosing' || flow === 'pairing'

export const nextConnectFlow = (
  flow: ConnectFlow,
  event: ConnectFlowEvent,
): ConnectFlow =>
  match(event)
    .returnType<ConnectFlow>()
    .with('opened', () => 'choosing')
    // The sign-in step can't be dismissed; only the wallet list can.
    .with('dismissed', () => (flow === 'choosing' ? 'closed' : flow))
    .with('pairing-started', () => (flow === 'choosing' ? 'pairing' : flow))
    // Cancelling WalletConnect closes its UI without reopening ours.
    .with('pairing-cancelled', () => (flow === 'pairing' ? 'closed' : flow))
    // Reopen the picker on pairing failure so the error remains visible.
    .with('pairing-failed', () =>
      isAwaitingConnection(flow) ? 'choosing' : flow,
    )
    .with('connected', () => (isAwaitingConnection(flow) ? 'signing-in' : flow))
    // Eager reconnections close the picker and use standalone authentication.
    .with('reconnected', () => (isAwaitingConnection(flow) ? 'closed' : flow))
    .with('disconnected', 'finished', () =>
      flow === 'signing-in' ? 'closed' : flow,
    )
    .exhaustive()

// Matches the old `open` state: WalletConnect pairing counts as closed.
export const isConnectDialogOpen = (flow: ConnectFlow): boolean =>
  flow === 'choosing' || flow === 'signing-in'
