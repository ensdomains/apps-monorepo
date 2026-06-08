import { Intercom } from '@intercom/messenger-js-sdk'
import { createIsomorphicFn } from '@tanstack/react-start'

const CLIENT_initializeIntercom = () => {
  // Intercom is non-critical (support chat) and can throw when its messenger
  // is blocked (e.g. a domain not in the Intercom allowlist returns 403).
  // Never let it crash the app.
  try {
    Intercom({
      app_id: 're9q5yti',
    })
  } catch (error) {
    console.warn('[intercom] init failed', error)
  }
}

export const initializeIntercom = createIsomorphicFn().client(
  CLIENT_initializeIntercom,
)
