import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { createActor, fromTransition } from 'xstate'
import type { PaletteNavigation } from './executionPlan'

type PaletteHandoffContext = {
  readonly chainId: number
  readonly account?: Address
}

export type PaletteHandoffIntent = PaletteHandoffContext &
  (
    | { readonly kind: 'renew' | 'grant-role'; readonly name: string }
    | { readonly kind: 'expiring-names'; readonly address: Address }
  )

export type PendingPaletteHandoff = {
  readonly requestId: number
  readonly intent: PaletteHandoffIntent
}

export const getPaletteHandoffNavigation = (
  intent: PaletteHandoffIntent,
): PaletteNavigation =>
  intent.kind === 'expiring-names'
    ? { to: '/addr/$addr/names', params: { addr: intent.address } }
    : {
        to: intent.kind === 'renew' ? '/$name' : '/$name/roles',
        params: { name: intent.name },
      }

type PaletteHandoffOutcome =
  | { readonly requestId: number; readonly status: 'opened' | 'cancelled' }
  | {
      readonly requestId: number
      readonly status: 'blocked'
      readonly reason: string
    }

type PaletteHandoffState = {
  readonly nextRequestId: number
  readonly pending: PendingPaletteHandoff | null
  readonly outcome: PaletteHandoffOutcome | null
}

type PaletteHandoffEvent =
  | { readonly type: 'prepare'; readonly intent: PaletteHandoffIntent }
  | {
      readonly type: 'finish'
      readonly outcome: PaletteHandoffOutcome
    }

const INITIAL_STATE: PaletteHandoffState = {
  nextRequestId: 1,
  pending: null,
  outcome: null,
}

const transitionHandoff = (
  state: PaletteHandoffState,
  event: PaletteHandoffEvent,
): PaletteHandoffState => {
  if (event.type === 'prepare') {
    return {
      nextRequestId: state.nextRequestId + 1,
      pending: { requestId: state.nextRequestId, intent: event.intent },
      outcome: null,
    }
  }
  if (event.outcome.requestId !== state.pending?.requestId) return state
  return { ...state, pending: null, outcome: event.outcome }
}

export type PaletteHandoffReadiness =
  | 'ready'
  | 'checking'
  | { readonly reason: string }

export const getPaletteWorkflowReadiness = ({
  isChecking,
  canOpen,
  blockedReason,
  failureReason = null,
}: {
  readonly isChecking: boolean
  readonly canOpen: boolean
  readonly blockedReason: string
  readonly failureReason?: string | null
}): PaletteHandoffReadiness =>
  match({ isChecking, canOpen, failureReason })
    .with({ isChecking: true }, () => 'checking' as const)
    .when(
      ({ failureReason }) => failureReason !== null,
      () => ({ reason: failureReason ?? blockedReason }),
    )
    .with({ canOpen: true }, () => 'ready' as const)
    .otherwise(() => ({ reason: blockedReason }))

type HandoffConsumer = PaletteHandoffIntent & {
  readonly readiness: PaletteHandoffReadiness
}

type HandoffDecision =
  | { readonly status: 'ignore' | 'checking' }
  | { readonly status: 'ready'; readonly requestId: number }
  | {
      readonly status: 'blocked'
      readonly requestId: number
      readonly reason: string
    }

export const getPaletteHandoffDecision = (
  pending: PendingPaletteHandoff | null,
  consumer: HandoffConsumer,
): HandoffDecision => {
  if (!pending || pending.intent.kind !== consumer.kind) {
    return { status: 'ignore' }
  }
  const isMatchingTarget =
    'name' in pending.intent && 'name' in consumer
      ? pending.intent.name === consumer.name
      : 'address' in pending.intent &&
        'address' in consumer &&
        pending.intent.address.toLowerCase() === consumer.address.toLowerCase()
  if (!isMatchingTarget) {
    return { status: 'ignore' }
  }
  if (pending.intent.chainId !== consumer.chainId) {
    return {
      status: 'blocked',
      requestId: pending.requestId,
      reason: 'The network changed. Choose the action again on this network.',
    }
  }
  if (
    pending.intent.account &&
    pending.intent.account.toLowerCase() !== consumer.account?.toLowerCase()
  ) {
    return {
      status: 'blocked',
      requestId: pending.requestId,
      reason: 'The connected wallet changed. Choose the action again.',
    }
  }
  if (consumer.readiness === 'checking') return { status: 'checking' }
  if (consumer.readiness === 'ready') {
    return { status: 'ready', requestId: pending.requestId }
  }
  return {
    status: 'blocked',
    requestId: pending.requestId,
    reason: consumer.readiness.reason,
  }
}

export const createPaletteHandoffController = () => {
  const actor = createActor(fromTransition(transitionHandoff, INITIAL_STATE))
  actor.start()

  const getSnapshot = () => actor.getSnapshot().context
  const finish = (outcome: PaletteHandoffOutcome) =>
    actor.send({ type: 'finish', outcome })

  return {
    getSnapshot,
    subscribe: (onChange: () => void) => {
      const subscription = actor.subscribe(onChange)
      return () => subscription.unsubscribe()
    },
    prepare: (intent: PaletteHandoffIntent) => {
      const requestId = getSnapshot().nextRequestId
      actor.send({ type: 'prepare', intent })
      return requestId
    },
    claim: (requestId: number) => {
      const pending = getSnapshot().pending
      if (pending?.requestId !== requestId) return null
      finish({ requestId, status: 'opened' })
      return pending.intent
    },
    cancel: (requestId = getSnapshot().pending?.requestId) => {
      if (requestId !== undefined) finish({ requestId, status: 'cancelled' })
    },
    reject: (requestId: number, reason: string) => {
      if (getSnapshot().pending?.requestId !== requestId) return false
      finish({ requestId, status: 'blocked', reason })
      return true
    },
  }
}

// A bounded, in-memory one-shot handoff; existing features own the forms and transactions.
export const paletteHandoff = createPaletteHandoffController()
export const preparePaletteHandoff = paletteHandoff.prepare
export const cancelPaletteHandoff = paletteHandoff.cancel
