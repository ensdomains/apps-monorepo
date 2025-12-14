import type { ReactNode } from 'react'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import type { FeatureFlag } from '@/utils/feature-flags'

interface FeatureEnabledProps {
  flag: FeatureFlag
  children: ReactNode
  fallback?: ReactNode
}

export function FeatureEnabled({
  flag,
  children,
  fallback = null,
}: FeatureEnabledProps) {
  const enabled = useFeatureFlag(flag)

  if (!enabled) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
