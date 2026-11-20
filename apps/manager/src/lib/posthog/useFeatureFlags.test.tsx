import {
  useFeatureFlagEnabled,
  useFeatureFlagPayload,
} from '@ens-apps/utils/posthog/useFeatureFlags'
import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

const makeClient = () => ({
  isFeatureEnabled: vi.fn(() => true),
  getFeatureFlagResult: vi.fn(() => ({ payload: { message: 'healthy' } })),
  onFeatureFlags: vi.fn<(_: () => void) => () => void>(() => vi.fn()),
})

it('keeps rendering and disables optional content when SDK reads throw', () => {
  const client = makeClient()
  client.isFeatureEnabled.mockImplementation(() => {
    throw new Error('SDK unavailable')
  })
  client.getFeatureFlagResult.mockImplementation(() => {
    throw new Error('SDK unavailable')
  })

  const { result } = renderHook(() => ({
    enabled: useFeatureFlagEnabled(client, 'flag'),
    payload: useFeatureFlagPayload(client, 'flag'),
  }))

  expect(result.current).toEqual({ enabled: false, payload: undefined })
})

it('updates flags and object payloads on SDK notifications and unsubscribes', () => {
  const client = makeClient()
  const unsubscribe = vi.fn()
  client.onFeatureFlags.mockReturnValue(unsubscribe)
  const { result, unmount } = renderHook(() => ({
    enabled: useFeatureFlagEnabled(client, 'flag'),
    payload: useFeatureFlagPayload(client, 'flag'),
  }))
  expect(result.current).toEqual({
    enabled: true,
    payload: { message: 'healthy' },
  })

  client.isFeatureEnabled.mockReturnValue(false)
  client.getFeatureFlagResult.mockReturnValue({
    payload: { message: 'updated' },
  })
  act(() => {
    for (const [notify] of client.onFeatureFlags.mock.calls) notify()
  })

  expect(result.current).toEqual({
    enabled: false,
    payload: { message: 'updated' },
  })
  unmount()
  expect(unsubscribe).toHaveBeenCalledTimes(2)
})

it.each(['subscribe', 'unsubscribe'] as const)(
  'contains SDK %s failures',
  (failure) => {
    const client = makeClient()
    client.onFeatureFlags.mockImplementation(() => {
      if (failure === 'subscribe') throw new Error('SDK unavailable')
      return () => {
        throw new Error('SDK unavailable')
      }
    })

    const { result, unmount } = renderHook(() =>
      useFeatureFlagEnabled(client, 'flag'),
    )

    expect(result.current).toBe(true)
    expect(unmount).not.toThrow()
  },
)

it('leaves exposure tracking enabled for normal feature flag reads', () => {
  const client = makeClient()
  renderHook(() => useFeatureFlagEnabled(client, 'flag'))
  expect(client.isFeatureEnabled).toHaveBeenCalledWith('flag')
})
