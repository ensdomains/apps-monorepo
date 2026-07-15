import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POSTHOG_FEATURE_FLAGS, usePostHogFeatureFlag } from './feature-flags'

const useFeatureFlagEnabled = vi.hoisted(() => vi.fn())

vi.mock('@posthog/react', () => ({
  useFeatureFlagEnabled,
}))

describe('usePostHogFeatureFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the profile view key with the legacy view as its safe default', () => {
    useFeatureFlagEnabled.mockReturnValue(false)

    const { result } = renderHook(() =>
      usePostHogFeatureFlag(POSTHOG_FEATURE_FLAGS.PROFILE_VIEW_NEW),
    )

    expect(result.current).toBe(false)
    expect(useFeatureFlagEnabled).toHaveBeenCalledWith(
      'profile-view-new',
      false,
    )
  })

  it('returns the resolved PostHog value', () => {
    useFeatureFlagEnabled.mockReturnValue(true)

    const { result } = renderHook(() =>
      usePostHogFeatureFlag(POSTHOG_FEATURE_FLAGS.PROFILE_VIEW_NEW),
    )

    expect(result.current).toBe(true)
  })

  it('returns false while PostHog is loading feature flags', () => {
    useFeatureFlagEnabled.mockReturnValue(undefined)

    const { result } = renderHook(() =>
      usePostHogFeatureFlag(POSTHOG_FEATURE_FLAGS.PROFILE_VIEW_NEW),
    )

    expect(result.current).toBe(false)
  })
})
