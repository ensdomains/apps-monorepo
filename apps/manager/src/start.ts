/**
 * TanStack Start global configuration.
 *
 * Applies CSP + security headers on every request handled by Start (SSR,
 * server routes, server functions). Production only for the CSP itself so
 * Vite HMR (`unsafe-eval` + ws) keeps working in `vite dev` — same exemption
 * portal gets by mounting CSP only on its Cloudflare worker.
 */

import { createMiddleware, createStart } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import {
  buildCspWithFrameAncestors,
  POSTHOG_CSP_REPORT_ENDPOINT,
  SECURITY_HEADER_VALUES,
} from './server/csp'

const securityHeadersMiddleware = createMiddleware().server(
  ({ next, request }) => {
    // Always set the clickjacking / MIME / referrer baselines (cheap, no
    // HMR interaction). CSP is production-only.
    for (const [name, value] of Object.entries(SECURITY_HEADER_VALUES)) {
      setResponseHeader(name, value)
    }

    if (import.meta.env.DEV || request.method !== 'GET') {
      return next()
    }

    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    const cspNonce = btoa(binary)

    setResponseHeader(
      'Content-Security-Policy',
      buildCspWithFrameAncestors({ nonce: cspNonce }),
    )
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
