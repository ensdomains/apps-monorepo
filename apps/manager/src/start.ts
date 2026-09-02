/**
 * TanStack Start global configuration — applies CSP + security headers to
 * every request Start handles. CSP is production-only so Vite HMR keeps
 * working in `vite dev`.
 */

import { createMiddleware, createStart } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import {
  buildCsp,
  CSP_HEADER_NAME,
  POSTHOG_CSP_REPORT_ENDPOINT,
  SECURITY_HEADER_VALUES,
} from './server/csp'

declare module '@tanstack/router-core' {
  interface Register {
    server: {
      requestContext: {
        cspNonce?: string
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

    if (import.meta.env.DEV || request.method !== 'GET') {
      return next()
    }

    const cspNonce = crypto.randomUUID()

    // Report-Only until the build sets VITE_CSP_ENFORCE=1 (see csp.ts).
    setResponseHeader(CSP_HEADER_NAME, buildCsp(cspNonce))
    setResponseHeader(
      'Reporting-Endpoints',
      `posthog="${POSTHOG_CSP_REPORT_ENDPOINT}"`,
    )

    return next({
      context: { cspNonce },
    })
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware],
}))
