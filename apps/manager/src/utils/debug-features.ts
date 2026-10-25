export const DEBUG_FEATURES_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_FEATURES === 'true'

export const DEBUG_PROFILE_NAME = 'debug.example'
export const DEBUG_ADDRESSES_PROFILE_NAME = 'debug-addresses.example'

const DEBUG_PROFILE_NAMES = new Set([
  DEBUG_PROFILE_NAME,
  DEBUG_ADDRESSES_PROFILE_NAME,
])

export const isDebugProfileName = (name: string) =>
  DEBUG_FEATURES_ENABLED && DEBUG_PROFILE_NAMES.has(name)
