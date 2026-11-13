import { notifyAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createActor, createMachine, type SnapshotFrom } from 'xstate'
import { useAnalyticsFlowView } from './useAnalyticsFlowView'

const mocks = vi.hoisted(() => ({
  consent: 'pending' as 'pending' | 'granted' | 'denied',
  loaded: false,
  capture: vi.fn(),
  identity: vi.fn(() => 'anonymous-browser'),
}))
vi.mock('posthog-js/dist/module.full.no-external', () => ({
  default: {
    get __loaded() {
      return mocks.loaded
    },
    get_explicit_consent_status: () => mocks.consent,
    get_distinct_id: mocks.identity,
  },
}))
vi.mock('./events', () => ({
  track: mocks.capture,
  getConnectedWalletAddress: () => null,
}))
vi.mock('wagmi', () => ({
  useConnection: () => ({ address: undefined, status: 'disconnected' }),
}))
const machine = createMachine({
  context: { analytics: { flow_id: 'flow' } },
  initial: 'duration',
  states: {
    duration: { on: { next: 'payment' } },
    payment: { on: { start: 'active' } },
    active: { on: { retry: 'payment' } },
  },
})
const getView = (snapshot: SnapshotFrom<typeof machine>) =>
  snapshot.matches('active')
    ? undefined
    : {
        flow: 'registration' as const,
        flow_id: snapshot.context.analytics.flow_id,
        step: snapshot.matches('duration')
          ? ('duration' as const)
          : ('payment' as const),
      }
beforeEach(() => {
  mocks.capture.mockClear()
  mocks.identity.mockReset().mockReturnValue('anonymous-browser')
  mocks.consent = 'pending'
  mocks.loaded = false
})
it('observes the current screen on consent changes and actor updates without blocking the actor', async () => {
  const actor = createActor(machine).start()
  const { rerender } = renderHook(() => useAnalyticsFlowView(actor, getView))
  act(() => actor.send({ type: 'next' }))
  expect(mocks.capture).not.toHaveBeenCalled()

  await act(async () => {
    mocks.loaded = true
    mocks.consent = 'granted'
    notifyAnalyticsConsent()
  })
  const entry = [
    ['registration:flow_view', { flow_id: 'flow' }],
    ['registration:payment_view', { flow_id: 'flow' }],
  ]
  expect(mocks.capture.mock.calls).toEqual(entry)
  rerender()
  expect(mocks.capture.mock.calls).toEqual(entry)

  act(() => actor.send({ type: 'start' }))
  mocks.identity.mockImplementationOnce(() => {
    throw new Error('SDK unavailable')
  })
  act(() => actor.send({ type: 'retry' }))
  expect(actor.getSnapshot().matches('payment')).toBe(true)
  expect(mocks.capture.mock.calls).toEqual(entry)
  act(() => actor.send({ type: 'next' }))
  expect(mocks.capture.mock.calls).toEqual([
    ...entry,
    ['registration:payment_view', { flow_id: 'flow' }],
  ])

  act(() => {
    mocks.consent = 'denied'
    notifyAnalyticsConsent()
  })
  mocks.capture.mockClear()
  act(() => actor.send({ type: 'start' }))
  await act(async () => {
    mocks.consent = 'granted'
    notifyAnalyticsConsent()
  })
  expect(mocks.capture).not.toHaveBeenCalled()
  act(() => actor.send({ type: 'retry' }))
  expect(mocks.capture.mock.calls).toEqual(entry)
  actor.stop()
})
