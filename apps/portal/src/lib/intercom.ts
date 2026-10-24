import { boot, Intercom, shutdown } from '@intercom/messenger-js-sdk'

const INTERCOM_APP_ID = 're9q5yti'

let isRunning = false

/** Loads and boots the messenger, only for visitors who accepted analytics. */
export const startIntercom = () => {
  if (isRunning) return
  // Non-critical: can throw on blocked domains (403). Never crash the app.
  try {
    // The first call loads the widget; boot starts it again after a shutdown.
    Intercom({ app_id: INTERCOM_APP_ID })
    boot({ app_id: INTERCOM_APP_ID })
    isRunning = true
  } catch (error) {
    console.warn('[intercom] init failed', error)
  }
}

/** Shuts the messenger down, ending its session, once consent is gone. */
export const stopIntercom = () => {
  if (!isRunning) return
  shutdown()
  isRunning = false
}
