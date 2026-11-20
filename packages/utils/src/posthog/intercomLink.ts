type LinkContext = {
  readonly key: string
  readonly distinctId: string
}

const RETRY_INTERVAL_MS = 1000
const MAX_ATTEMPTS = 30

/** One bounded readiness retry per current identity; no support SDK dependency. */
export const createIntercomAnalyticsLink = ({
  getContext,
  getVisitorId,
  link,
}: {
  readonly getContext: () => LinkContext | undefined
  readonly getVisitorId: () => string | undefined
  readonly link: (context: LinkContext, visitorId: string) => void
}) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pendingKey: string | undefined
  let linkedKey: string | undefined

  const cancel = (): void => {
    clearTimeout(timer)
    timer = undefined
    pendingKey = undefined
  }
  const sync = (): void => {
    try {
      const context = getContext()
      if (!context) {
        cancel()
        linkedKey = undefined
        return
      }
      if (linkedKey === context.key || pendingKey === context.key) return
      cancel()
      pendingKey = context.key
      let attempts = 0
      const attempt = (): void => {
        timer = undefined
        try {
          const current = getContext()
          if (current?.key !== context.key) {
            cancel()
            return
          }
          const visitorId = getVisitorId()
          if (visitorId) {
            link(current, visitorId)
            linkedKey = context.key
            pendingKey = undefined
            return
          }
          attempts += 1
          if (attempts < MAX_ATTEMPTS)
            timer = setTimeout(attempt, RETRY_INTERVAL_MS)
          else cancel()
        } catch {
          cancel()
        }
      }
      attempt()
    } catch {
      cancel()
    }
  }
  return { sync, cancel }
}
