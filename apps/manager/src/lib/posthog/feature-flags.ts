import { useFeatureFlagEnabled } from '@posthog/react'
import { useEffect, useState } from 'react'

const FEATURE_FLAG_LOADING_TIMEOUT_MS = 3_000

export const POSTHOG_FEATURE_FLAGS = {
  PROFILE_VIEW_NEW: 'profile-view-new',
} as const

export type PostHogFeatureFlag =
  (typeof POSTHOG_FEATURE_FLAGS)[keyof typeof POSTHOG_FEATURE_FLAGS]

// Nested profile consumers must share the fallback instead of restarting the blank window.
const timedOutFeatureFlags = new Set<PostHogFeatureFlag>()

export function usePostHogFeatureFlag(
  flag: PostHogFeatureFlag,
): boolean | undefined {
  const enabled = useFeatureFlagEnabled(flag)
  const [hasTimedOut, setHasTimedOut] = useState(() =>
    timedOutFeatureFlags.has(flag),
  )

  useEffect(() => {
    if (enabled !== undefined || hasTimedOut) return
    const timeout = window.setTimeout(() => {
      timedOutFeatureFlags.add(flag)
      setHasTimedOut(true)
    }, FEATURE_FLAG_LOADING_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [enabled, flag, hasTimedOut])

  return enabled ?? (hasTimedOut ? false : undefined)
}
