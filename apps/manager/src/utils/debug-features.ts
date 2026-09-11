export const DEBUG_FEATURES_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_FEATURES === 'true'

export const DEBUG_PROFILE_NAME = 'debug.example'

export const isDebugProfileName = (name: string) =>
  DEBUG_FEATURES_ENABLED && name === DEBUG_PROFILE_NAME
