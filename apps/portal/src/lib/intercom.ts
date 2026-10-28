import { Intercom } from '@intercom/messenger-js-sdk'

export const initializeIntercom = () => {
  // Unset on the .eth mirror, which ships without Intercom.
  const appId = import.meta.env.VITE_INTERCOM_APP_ID
  if (!appId) return
  // Non-critical: can throw on blocked domains (403). Never crash the app.
  try {
    Intercom({
      app_id: appId,
    })
  } catch (error) {
    console.warn('[intercom] init failed', error)
  }
}
