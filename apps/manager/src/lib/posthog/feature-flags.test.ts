import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POSTHOG_FEATURE_FLAGS, usePostHogFeatureFlag } from './feature-flags'

const useFeatureFlagEnabled = vi.hoisted(() => vi.fn())

vi.mock('@posthog/react', () => ({
  useFeatureFlagEnabled,
}))

describe('usePostHogFeatureFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the profile view key', () => {
    useFeatureFlagEnabled.mockReturnValue(false)

    const { result } = renderHook(() =>
      usePostHogFeatureFlag(POSTHOG_FEATURE_FLAGS.PROFILE_VIEW_NEW),
    )

    expect(result.current).toBe(false)
    expect(useFeatureFlagEnabled).toHaveBeenCalledWith('profile-view-new')
  })

  it('returns the resolved PostHog value', () => {
    useFeatureFlagEnabled.mockReturnValue(true)

    const { result } = renderHook(() =>
      usePostHogFeatureFlag(POSTHOG_FEATURE_FLAGS.PROFILE_VIEW_NEW),
    )

    expect(result.current).toBe(true)
  })

  it('preserves the loading state', () => {
    useFeatureFlagEnabled.mockReturnValue(undefined)

    const { result } = renderHook(() =>
      usePostHogFeatureFlag(POSTHOG_FEATURE_FLAGS.PROFILE_VIEW_NEW),
    )

    expect(result.current).toBeUndefined()
  })

  it('shares the legacy fallback after loading times out', () => {
    vi.useFakeTimers()
    useFeatureFlagEnabled.mockReturnValue(undefined)

    const { result } = renderHook(() =>
      usePostHogFeatureFlag(POSTHOG_FEATURE_FLAGS.PROFILE_VIEW_NEW),
    )

    act(() => vi.advanceTimersByTime(3_000))

    expect(result.current).toBe(false)

    const { result: nestedResult } = renderHook(() =>
      usePostHogFeatureFlag(POSTHOG_FEATURE_FLAGS.PROFILE_VIEW_NEW),
    )

    expect(nestedResult.current).toBe(false)
  })
})
