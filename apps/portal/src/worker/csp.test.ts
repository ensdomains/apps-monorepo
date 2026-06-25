import { describe, expect, it } from 'vitest'
import {
  cspMetaTag,
  cspWithFrameAncestors,
  cspWithoutFrameAncestors,
  withSecurityHeaders,
} from './csp'

/** Parse a policy string into a `{ directive: tokens[] }` map. */
function parseDirectives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...values] = directive.split(/\s+/)
        return [name, values]
      }),
  )
}

const header = parseDirectives(cspWithFrameAncestors)
const meta = parseDirectives(cspWithoutFrameAncestors)

describe('csp', () => {
  describe('policy strings', () => {
    it('locks the baseline directives down to self', () => {
      expect(header['default-src']).toEqual(["'self'"])
      expect(header['object-src']).toEqual(["'none'"])
      expect(header['base-uri']).toEqual(["'self'"])
      expect(header['form-action']).toEqual(["'self'"])
    })

    it('never allows unsafe script execution', () => {
      // 'wasm-unsafe-eval' (WASM compile only) is allowed; general 'unsafe-eval'
      // and 'unsafe-inline' must never appear in script-src.
      expect(header['script-src']).not.toContain("'unsafe-inline'")
      expect(header['script-src']).not.toContain("'unsafe-eval'")
      expect(header['script-src']).toContain("'wasm-unsafe-eval'")
    })

    it('puts frame-ancestors in the header only, never the meta tag', () => {
      // frame-ancestors is invalid inside a <meta> tag.
      expect(header['frame-ancestors']).toEqual(["'none'"])
      expect(meta['frame-ancestors']).toBeUndefined()
    })

    it('keeps upgrade-insecure-requests in both header and meta', () => {
      // Unlike frame-ancestors, this directive is valid in a <meta> tag.
      expect(header).toHaveProperty('upgrade-insecure-requests')
      expect(meta).toHaveProperty('upgrade-insecure-requests')
    })

    it('reports violations to PostHog from the header only', () => {
      expect(header['report-to']).toEqual(['posthog'])
      expect(header['report-uri']?.[0]).toContain(
        'https://eu.i.posthog.com/report/',
      )
      expect(meta['report-to']).toBeUndefined()
      expect(meta['report-uri']).toBeUndefined()
    })

    it('builds a meta tag carrying the meta policy', () => {
      expect(cspMetaTag).toContain('http-equiv="Content-Security-Policy"')
      expect(cspMetaTag).toContain(cspWithoutFrameAncestors)
      expect(cspMetaTag).not.toContain('frame-ancestors')
    })
  })

  describe('withSecurityHeaders', () => {
    it('sets the CSP and standard security headers', () => {
      const result = withSecurityHeaders(new Response('hi'))

      expect(result.headers.get('Content-Security-Policy')).toBe(
        cspWithFrameAncestors,
      )
      expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(result.headers.get('Referrer-Policy')).toBe(
        'strict-origin-when-cross-origin',
      )
      expect(result.headers.get('Permissions-Policy')).toBe(
        'geolocation=(), microphone=(), camera=()',
      )
    })

    it('declares the PostHog reporting endpoint that report-to targets', () => {
      const result = withSecurityHeaders(new Response('hi'))
      const reportingEndpoints = result.headers.get('Reporting-Endpoints') ?? ''
      expect(reportingEndpoints).toMatch(
        /^posthog="https:\/\/eu\.i\.posthog\.com\/report\//,
      )
    })

    it('keeps X-Frame-Options consistent with frame-ancestors', () => {
      // Guards the header/CSP contradiction: 'self' ⇔ SAMEORIGIN, 'none' ⇔ DENY.
      const result = withSecurityHeaders(new Response('hi'))
      const frameAncestors = parseDirectives(
        result.headers.get('Content-Security-Policy') ?? '',
      )['frame-ancestors']?.[0]
      const xFrameOptions = result.headers.get('X-Frame-Options')

      const agree =
        (frameAncestors === "'self'" && xFrameOptions === 'SAMEORIGIN') ||
        (frameAncestors === "'none'" && xFrameOptions === 'DENY')
      expect(agree).toBe(true)
    })

    it('preserves the original response body and status', async () => {
      const result = withSecurityHeaders(
        new Response('body', { status: 201, statusText: 'Created' }),
      )
      expect(result.status).toBe(201)
      expect(await result.text()).toBe('body')
    })
  })
})
