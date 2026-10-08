/**
 * TanStack Start global configuration — applies CSP + security headers to
 * every request Start handles. CSP is production-only so Vite HMR keeps
 * working in `vite dev`.
 */

import { createMiddleware, createStart } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { buildCsp, CSP_HEADER_NAME, SECURITY_HEADER_VALUES } from './server/csp'

declare module '@tanstack/router-core' {
  interface Register {
    server: {
      requestContext: {
        cspNonce?: string
        origin?: string
      }
    }
  }
}

const securityHeadersMiddleware = createMiddleware().server(
  ({ next, request }) => {
    // Baselines are safe in dev; only the CSP interferes with HMR.
    for (const [name, value] of Object.entries(SECURITY_HEADER_VALUES)) {
      setResponseHeader(name, value)
    }

    // Every render needs the origin it is being served from, to build the
    // absolute og:image URLs (see `getSiteOrigin`); the CSP below is
    // production-only, the origin is not.
    const origin = new URL(request.url).origin

    if (import.meta.env.DEV || request.method !== 'GET') {
      return next({ context: { origin } })
    }

    const cspNonce = crypto.randomUUID()

    // Report-Only until the build sets VITE_CSP_ENFORCE=1 (see csp.ts).
    setResponseHeader(CSP_HEADER_NAME, buildCsp(cspNonce))
    // POSTHOG_LAUNCH_PAUSE: reporting paused. Restore POSTHOG_CSP_REPORT_ENDPOINT import and the endpoint/directives in server/csp.ts together.
    // setResponseHeader(
    //   'Reporting-Endpoints',
    //   `posthog="${POSTHOG_CSP_REPORT_ENDPOINT}"`,
    // )

    return next({
      context: { cspNonce, origin },
    })
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware],
}))
