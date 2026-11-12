export const DEBUG_FEATURES_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_FEATURES === 'true'

// Keep the import beside the flag so production builds prune the fixture chunk.
export const loadDebugProfiles = DEBUG_FEATURES_ENABLED
  ? () => import('../features/profile/MOCK')
  : undefined

export const isMaybeDebugName = (name: string): boolean =>
  DEBUG_FEATURES_ENABLED && name.endsWith('.example')
