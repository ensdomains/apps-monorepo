import { Intercom, update } from '@intercom/messenger-js-sdk'
import { createIsomorphicFn } from '@tanstack/react-start'

const CLIENT_initializeIntercom = () => {
  // Non-critical: can throw on blocked domains (403). Never crash the app.
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

const DEFAULT_LAUNCHER_PADDING = 20
export const LAUNCHER_SIZE = 60
export const LAUNCHER_RIGHT_PADDING = 20
const LAUNCHER_GAP = 16

/** Lifts the launcher above whatever ends `clearance` px from the viewport bottom; 0 restores the default. */
export const setIntercomLauncherClearance = (clearance: number) =>
  update({
    vertical_padding: Math.max(
      DEFAULT_LAUNCHER_PADDING,
      Math.round(clearance) + LAUNCHER_GAP,
    ),
  })
