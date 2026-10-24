import { boot, Intercom, shutdown, update } from '@intercom/messenger-js-sdk'

const INTERCOM_APP_ID = 're9q5yti'
const DEFAULT_LAUNCHER_PADDING = 20
export const LAUNCHER_SIZE = 60
export const LAUNCHER_RIGHT_PADDING = 20
const LAUNCHER_GAP = 16

let isRunning = false
let launcherPadding = DEFAULT_LAUNCHER_PADDING

/** Loads and boots the messenger, only for visitors who accepted analytics. */
export const startIntercom = () => {
  if (isRunning) return
  const settings = {
    app_id: INTERCOM_APP_ID,
    vertical_padding: launcherPadding,
  }
  // Non-critical: can throw on blocked domains (403). Never crash the app.
  try {
    // The first call loads the widget; boot starts it again after a shutdown.
    Intercom(settings)
    boot(settings)
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

/** Lifts the launcher above whatever ends `clearance` px from the viewport bottom; 0 restores the default. */
export const setIntercomLauncherClearance = (clearance: number) => {
  launcherPadding = Math.max(
    DEFAULT_LAUNCHER_PADDING,
    Math.round(clearance) + LAUNCHER_GAP,
  )
  // Until Intercom runs, startIntercom applies it.
  if (isRunning) update({ vertical_padding: launcherPadding })
}
