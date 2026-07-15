import { useFeatureFlagEnabled } from '@posthog/react'

export const POSTHOG_FEATURE_FLAGS = {
  PROFILE_VIEW_NEW: 'profile-view-new',
} as const

export type PostHogFeatureFlag =
  (typeof POSTHOG_FEATURE_FLAGS)[keyof typeof POSTHOG_FEATURE_FLAGS]

export function usePostHogFeatureFlag(flag: PostHogFeatureFlag): boolean {
  return useFeatureFlagEnabled(flag, false)
}
