/**
 * Decide whether a connected user on the landing page should be auto-redirected
 * to the dashboard.
 *
 * Extracted as a pure function so the redirect rule is testable independently
 * of the router/query wiring. The "wait until the connection settles" guard
 * matters: navigating mid-(re)connect races TanStack Router's match state and
 * can blank the page, so we only redirect once `isConnecting`/`isReconnecting`
 * have cleared.
 */
export const shouldRedirectToDashboard = ({
  isConnecting,
  isReconnecting,
  hasDomains,
  domainsQuerySucceeded,
  domainsQueryPaused,
  forceLanding,
}: {
  readonly isConnecting: boolean
  readonly isReconnecting: boolean
  readonly hasDomains: boolean | undefined
  readonly domainsQuerySucceeded: boolean
  readonly domainsQueryPaused: boolean
  readonly forceLanding: boolean | undefined
}): boolean => {
  if (isConnecting || isReconnecting) return false
  return Boolean(
    hasDomains && domainsQuerySucceeded && !domainsQueryPaused && !forceLanding,
  )
}
