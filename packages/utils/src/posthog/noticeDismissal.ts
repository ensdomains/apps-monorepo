const NOTICE_DISMISSED_KEY = 'notice-dismissed'

/** The dismissed notice id, or null without storage (server, blocked storage). */
export const readDismissedNoticeId = (): string | null => {
  try {
    return typeof window === 'undefined'
      ? null
      : window.localStorage.getItem(NOTICE_DISMISSED_KEY)
  } catch {
    return null
  }
}

/** Best effort: with storage blocked the dismissal lives in memory only. */
export const storeDismissedNoticeId = (id: string): void => {
  try {
    window.localStorage.setItem(NOTICE_DISMISSED_KEY, id)
  } catch {
    return
  }
}
