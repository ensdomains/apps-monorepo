// Check for development mode across different environments:
const getIsDev = (): boolean => {
  try {
    const viteEnv = (import.meta as { env?: { DEV?: boolean } }).env
    if (viteEnv?.DEV !== undefined) {
      return viteEnv.DEV
    }
  } catch {
    // import.meta.env not available
  }

  if (
    typeof process !== 'undefined' &&
    process.env?.NODE_ENV === 'development'
  ) {
    return true
  }

  return false
}

const isDev = getIsDev()

export const logger = {
  debug: (...args: unknown[]) => isDev && console.debug('[DEBUG]', ...args),
  info: (...args: unknown[]) => isDev && console.info('[INFO]', ...args),
  warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
}
