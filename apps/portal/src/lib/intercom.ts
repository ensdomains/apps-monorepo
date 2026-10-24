import { Intercom } from '@intercom/messenger-js-sdk'

export const INTERCOM_APP_ID = 're9q5yti'

export const initializeIntercom = () => {
  // Non-critical: can throw on blocked domains (403). Never crash the app.
  try {
    Intercom({
      app_id: INTERCOM_APP_ID,
    })
  } catch (error) {
    console.warn('[intercom] init failed', error)
  }
}
