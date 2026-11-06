import { notifyAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { getAnalyticsReadyKey } from './flow'
import { useAnalyticsFlowReady } from './useAnalyticsFlowReady'

const client = vi.hoisted(() => ({
  __loaded: false,
  get_explicit_consent_status: vi
    .fn<() => 'pending' | 'granted'>()
    .mockReturnValue('pending'),
  get_distinct_id: () => 'anonymous-browser',
}))

vi.mock('posthog-js/dist/module.full.no-external', () => ({ default: client }))

it('notifies the live actor after SDK load and consent, without observing before consent', async () => {
  const actor = { send: vi.fn() }
  const view = renderHook(() => useAnalyticsFlowReady(actor))
  expect(actor.send).not.toHaveBeenCalled()
  act(() => {
    client.__loaded = true
    notifyAnalyticsConsent()
  })
  expect(actor.send).not.toHaveBeenCalled()
  act(() => {
    client.get_explicit_consent_status.mockReturnValue('granted')
    notifyAnalyticsConsent()
  })
  await waitFor(() =>
    expect(actor.send).toHaveBeenCalledWith({
      type: 'analytics.ready',
      readyKey: getAnalyticsReadyKey(),
    }),
  )
  expect(actor.send).toHaveBeenCalledTimes(1)
  view.unmount()
})
