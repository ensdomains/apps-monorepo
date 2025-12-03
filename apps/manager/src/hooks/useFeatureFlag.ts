import { usePostHog } from '@/components/PostHogProvider'

export function useFeatureFlag(flag: string): boolean {
  const { isFeatureEnabled } = usePostHog()
  return isFeatureEnabled(flag)
}

export function useFeatureFlagVariant(
  flag: string,
): string | boolean | undefined {
  const { getFeatureFlag } = usePostHog()
  return getFeatureFlag(flag)
}
