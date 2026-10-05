import { useEffect } from 'react'
import useLocalStorageState from 'use-local-storage-state'

// Opt-in: nothing third-party (PostHog, Intercom) loads until this is true.
export const useTelemetryEnabled = (): readonly [
  boolean,
  (isEnabled: boolean) => void,
] => {
  const [isEnabled, setIsEnabled] = useLocalStorageState<boolean>(
    'telemetry-enabled',
    { defaultValue: false },
  )

  // Mirror the toggle into a cookie. CSP violation reports are driven by
  // response headers, which only the worker can change — and the worker can
  // see cookies, not localStorage (see worker/csp.ts). Without this, an
  // opted-out visitor would still send page URLs to PostHog on any violation.
  useEffect(() => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is async and still inconsistent across browsers; a synchronous single-cookie write needs document.cookie.
    document.cookie = isEnabled
      ? `telemetry=1; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
      : `telemetry=; Path=/; Max-Age=0; SameSite=Lax${secure}`
  }, [isEnabled])

  return [isEnabled, setIsEnabled] as const
}
