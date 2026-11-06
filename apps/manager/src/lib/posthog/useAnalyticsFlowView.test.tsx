import { notifyAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { act, renderHook, waitFor } from '@testing-library/react'
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
it.each([
  { step: 'duration', isLoaded: false, consent: 'granted' },
  { step: 'payment', isLoaded: false, consent: 'granted' },
  { step: 'payment', isLoaded: true, consent: 'pending' },
] as const)(
  'observes only the visible $step when analytics becomes available ($consent, $isLoaded)',
  async ({ step, isLoaded, consent }) => {
    mocks.consent = consent
    mocks.loaded = isLoaded
    const actor = createActor(machine).start()
    if (step === 'payment') actor.send({ type: 'next' })
    const view = renderHook(() => useAnalyticsFlowView(actor, getView))
    expect(mocks.capture).not.toHaveBeenCalled()
    act(() => {
      mocks.loaded = true
      mocks.consent = 'granted'
      notifyAnalyticsConsent()
    })
    await waitFor(() =>
      expect(mocks.capture.mock.calls).toEqual([
        ['registration:flow_view', { flow_id: 'flow' }],
        [
          step === 'duration'
            ? 'registration:duration_view'
            : 'registration:payment_view',
          { flow_id: 'flow' },
        ],
      ]),
    )
    view.rerender()
    expect(mocks.capture).toHaveBeenCalledTimes(2)
    actor.stop()
  },
)
it('tracks subsequent visible steps once without repeating the flow view', async () => {
  mocks.loaded = true
  mocks.consent = 'granted'
  const actor = createActor(machine).start()
  renderHook(() => useAnalyticsFlowView(actor, getView))
  await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2))
  act(() => actor.send({ type: 'next' }))
  await waitFor(() =>
    expect(mocks.capture.mock.calls).toEqual([
      ['registration:flow_view', { flow_id: 'flow' }],
      ['registration:duration_view', { flow_id: 'flow' }],
      ['registration:payment_view', { flow_id: 'flow' }],
    ]),
  )
  act(() => actor.send({ type: 'start' }))
  act(() => actor.send({ type: 'retry' }))
  expect(mocks.capture.mock.calls).toEqual([
    ['registration:flow_view', { flow_id: 'flow' }],
    ['registration:duration_view', { flow_id: 'flow' }],
    ['registration:payment_view', { flow_id: 'flow' }],
    ['registration:payment_view', { flow_id: 'flow' }],
  ])
  actor.stop()
})
it('does not bind an active operation when consent is granted', async () => {
  const actor = createActor(machine).start()
  actor.send({ type: 'next' })
  actor.send({ type: 'start' })
  renderHook(() => useAnalyticsFlowView(actor, getView))
  await act(async () => {
    mocks.loaded = true
    mocks.consent = 'granted'
    notifyAnalyticsConsent()
  })
  expect(mocks.capture).not.toHaveBeenCalled()
  actor.stop()
})

it('observes the current surface again after consent is withdrawn and granted', async () => {
  mocks.loaded = true
  mocks.consent = 'granted'
  const actor = createActor(machine).start()
  actor.send({ type: 'next' })
  renderHook(() => useAnalyticsFlowView(actor, getView))
  await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2))
  act(() => {
    mocks.consent = 'denied'
    notifyAnalyticsConsent()
  })
  act(() => actor.send({ type: 'next' }))
  expect(mocks.capture).toHaveBeenCalledTimes(2)
  act(() => {
    mocks.consent = 'granted'
    notifyAnalyticsConsent()
  })
  await waitFor(() =>
    expect(mocks.capture.mock.calls).toEqual([
      ['registration:flow_view', { flow_id: 'flow' }],
      ['registration:payment_view', { flow_id: 'flow' }],
      ['registration:flow_view', { flow_id: 'flow' }],
      ['registration:payment_view', { flow_id: 'flow' }],
    ]),
  )
  actor.stop()
})

it('keeps the actor working when SDK identity reads throw', async () => {
  mocks.loaded = true
  mocks.consent = 'granted'
  const actor = createActor(machine).start()
  renderHook(() => useAnalyticsFlowView(actor, getView))
  await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2))
  mocks.identity.mockImplementationOnce(() => {
    throw new Error('SDK unavailable')
  })
  act(() => actor.send({ type: 'next' }))
  expect(actor.getSnapshot().matches('payment')).toBe(true)
  expect(mocks.capture).toHaveBeenCalledTimes(2)
  act(() => actor.send({ type: 'next' }))
  expect(mocks.capture).toHaveBeenLastCalledWith('registration:payment_view', {
    flow_id: 'flow',
  })
  actor.stop()
})
