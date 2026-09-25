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
    setResponseHeader(
      'Reporting-Endpoints',
      `posthog="${POSTHOG_CSP_REPORT_ENDPOINT}"`,
    )

    return next({
      context: { cspNonce, origin },
    })
  },
)

const sameOriginMutationMiddleware = createMiddleware().server(
  ({ next, request }) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next()

    const expectedOrigin = new URL(request.url).origin
    const origin = request.headers.get('Origin')
    const referer = request.headers.get('Referer')
    const fetchSite = request.headers.get('Sec-Fetch-Site')
    const validOrigin = origin === null || origin === expectedOrigin
    let validReferer = false
    if (referer) {
      try {
        validReferer = new URL(referer).origin === expectedOrigin
      } catch {
        validReferer = false
      }
    }
    if (
      !validOrigin ||
      (fetchSite !== 'same-origin' &&
        origin !== expectedOrigin &&
        !validReferer)
    ) {
      throw new Response('Forbidden', { status: 403 })
    }
    return next()
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [sameOriginMutationMiddleware, securityHeadersMiddleware],
}))
