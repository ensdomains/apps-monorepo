import { createContext, useContext, useEffect, useState } from 'react'
import { initPostHog, posthog } from '@/lib/posthog'

const PostHogContext = createContext<{
  isFeatureEnabled: (flag: string) => boolean
  getFeatureFlag: (flag: string) => boolean | string | undefined
}>({
  isFeatureEnabled: () => false,
  getFeatureFlag: () => undefined,
})

export function usePostHog() {
  return useContext(PostHogContext)
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [flagsLoaded, setFlagsLoaded] = useState(false)

  useEffect(() => {
    initPostHog()

    const handleFlags = () => {
      setFlagsLoaded(true)
    }

    posthog.onFeatureFlags(handleFlags)

    if (
      posthog.featureFlags.getFlags() &&
      posthog.featureFlags.getFlags().length > 0
    ) {
      setFlagsLoaded(true)
    }

    return () => {}
  }, [])

  const isFeatureEnabled = (flag: string) => {
    return posthog.isFeatureEnabled(flag) ?? false
  }

  const getFeatureFlag = (flag: string) => {
    return posthog.getFeatureFlag(flag)
  }

  const value = {
    isFeatureEnabled,
    getFeatureFlag,
    _flagsLoaded: flagsLoaded,
  }

  return (
    <PostHogContext.Provider value={value}>{children}</PostHogContext.Provider>
  )
}
