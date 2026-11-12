// @vitest-environment happy-dom
import { notifyAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useRegistrationFlowView } from '@/features/register/hooks/useRegistrationFlowView'
import { useRenewalFlowView } from '@/features/renew/hooks/useRenewalFlowView'

const mocks = vi.hoisted(() => ({
  consent: 'pending' as 'pending' | 'granted' | 'denied',
  loaded: false,
  track: vi.fn(),
  identity: vi.fn(() => 'anonymous-browser'),
  connection: {
    address: undefined as string | undefined,
    status: 'disconnected',
  },
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
vi.mock('./events', () => ({ track: mocks.track }))
vi.mock('wagmi', () => ({ useConnection: () => mocks.connection }))

beforeEach(() => {
  mocks.consent = 'pending'
  mocks.loaded = false
  mocks.track.mockClear()
  mocks.identity.mockReset().mockReturnValue('anonymous-browser')
  mocks.connection = { address: undefined, status: 'disconnected' }
})

it('observes only the current renewal screen after consent and contains SDK failure', async () => {
  const view = {
    flow_id: 'renew-flow',
    is_bulk: true,
    protocol_version: 'mixed' as const,
    v1_item_count: 1,
    v2_item_count: 2,
  }
  const { rerender } = renderHook(
    ({ step }: { readonly step: 'settings' | 'summary' }) =>
      useRenewalFlowView(view, true, step),
    { initialProps: { step: 'settings' } },
  )
  rerender({ step: 'summary' })
  expect(mocks.track).not.toHaveBeenCalled()
  await act(async () => {
    mocks.loaded = true
    mocks.consent = 'granted'
    notifyAnalyticsConsent()
  })
  expect(mocks.track.mock.calls).toEqual([
    ['renewal:flow_view', view],
    ['renewal:payment_view', view],
  ])
  mocks.identity.mockImplementationOnce(() => {
    throw new Error('SDK unavailable')
  })
  await act(async () => {
    rerender({ step: 'settings' })
  })
  expect(mocks.track.mock.calls).toHaveLength(2)
  await act(async () => {
    mocks.consent = 'denied'
    notifyAnalyticsConsent()
    rerender({ step: 'summary' })
  })
  expect(mocks.track.mock.calls).toHaveLength(2)
})

it('observes registration payment only when the connected payment picker becomes visible', async () => {
  mocks.loaded = true
  mocks.consent = 'granted'
  const { rerender } = renderHook(
    ({ hasPayment }: { readonly hasPayment: boolean }) =>
      useRegistrationFlowView({
        flowId: 'register-flow',
        isVisible: true,
        isPaymentVisible: hasPayment,
      }),
    { initialProps: { hasPayment: false } },
  )
  await act(async () => {})
  expect(mocks.track.mock.calls).toEqual([
    ['registration:flow_view', { flow_id: 'register-flow' }],
    ['registration:duration_view', { flow_id: 'register-flow' }],
  ])
  await act(async () => {
    rerender({ hasPayment: true })
  })
  expect(mocks.track.mock.calls).toEqual([
    ['registration:flow_view', { flow_id: 'register-flow' }],
    ['registration:duration_view', { flow_id: 'register-flow' }],
    ['registration:payment_view', { flow_id: 'register-flow' }],
  ])
  await act(async () => {
    rerender({ hasPayment: true })
  })
  expect(mocks.track.mock.calls).toHaveLength(3)
})

it('shares one consent poll across mounted views and stops it after the last unmount', () => {
  vi.useFakeTimers()
  try {
    mocks.loaded = true
    mocks.consent = 'granted'
    const first = renderHook(() =>
      useRegistrationFlowView({
        flowId: 'first',
        isVisible: true,
        isPaymentVisible: false,
      }),
    )
    const second = renderHook(() =>
      useRenewalFlowView(
        { flow_id: 'second', is_bulk: false },
        true,
        'settings',
      ),
    )
    expect(vi.getTimerCount()).toBe(1)
    first.unmount()
    expect(vi.getTimerCount()).toBe(1)
    second.unmount()
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})
