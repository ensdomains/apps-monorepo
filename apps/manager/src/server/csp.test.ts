import { SEPOLIA_FALLBACK_RPC_URLS } from '@ens-apps/indexer/chain'
import { describe, expect, it } from 'vitest'
import {
  buildCspWithFrameAncestors,
  buildCspWithoutFrameAncestors,
  originFromEnvUrl,
  withSecurityHeaders,
} from './csp'

const TEST_NONCE = 'test-nonce-abc123'

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

const header = parseDirectives(
  buildCspWithFrameAncestors({ nonce: TEST_NONCE }),
)
const meta = parseDirectives(
  buildCspWithoutFrameAncestors({ nonce: TEST_NONCE }),
)

describe('csp', () => {
  describe('security invariants', () => {
    it('locks the baseline fetch directives to self', () => {
      expect(header['default-src']).toEqual(["'self'"])
      expect(header['object-src']).toEqual(["'none'"])
      expect(header['base-uri']).toEqual(["'self'"])
      expect(header['form-action']).toEqual(["'self'"])
    })

    it('never allows unsafe script execution', () => {
      expect(header['script-src']).toContain("'wasm-unsafe-eval'")
      expect(header['script-src']).toContain("'strict-dynamic'")
      expect(header['script-src']).toContain(`'nonce-${TEST_NONCE}'`)
      expect(header['script-src']).not.toContain("'unsafe-inline'")
      expect(header['script-src']).not.toContain("'unsafe-eval'")
    })

    it('forbids framing via both frame-ancestors and X-Frame-Options', () => {
      expect(header['frame-ancestors']).toEqual(["'none'"])
      expect(
        withSecurityHeaders(new Response('hi'), {
          nonce: TEST_NONCE,
        }).headers.get('X-Frame-Options'),
      ).toBe('DENY')
    })
  })

  describe('connect-src wildcard collapse', () => {
    const connectSrc = header['connect-src'] ?? []

    it("starts from 'self'", () => {
      expect(connectSrc).toContain("'self'")
    })

    it('allowlists every shared RPC failover origin', () => {
      for (const url of SEPOLIA_FALLBACK_RPC_URLS) {
        expect(connectSrc).toContain(new URL(url).origin)
      }
      expect(connectSrc).toContain('https://lb.drpc.live')
    })

    it('collapses ENS hosts into wildcards rather than listing them bare', () => {
      // The wildcard is the single source of truth in the static defaults.
      // Build-time VITE_API_URL may still append an exact origin via
      // OVERRIDE_CONNECT_ORIGINS (e.g. app-api.ens.dev from .env) — that's fine.
      expect(connectSrc).toContain('https://*.ens.dev')
      expect(connectSrc).not.toContain('https://graphql.ens.dev')

      expect(connectSrc).toContain('https://*.ens.domains')
      expect(connectSrc).not.toContain('https://jakob.ens.domains')
    })

    it('allowlists Rhinestone orchestrator and Intercom as wildcards', () => {
      expect(connectSrc).toContain('https://*.rhinestone.dev')
      expect(connectSrc).not.toContain('https://v1.orchestrator.rhinestone.dev')
      expect(connectSrc).toContain('https://*.intercom.io')
      expect(connectSrc).toContain('https://*.intercomcdn.com')
      expect(connectSrc).toContain('wss://*.intercom.io')
    })

    it('allowlists Alchemy NFT API as a wildcard', () => {
      expect(connectSrc).toContain('https://*.g.alchemy.com')
    })

    it('keeps image-only hosts out of connect-src', () => {
      expect(connectSrc).not.toContain('https://i.pinimg.com')
    })
  })

  describe('host-handling choices', () => {
    it('keeps image loading host-agnostic over https only', () => {
      expect(header['img-src']).toEqual(["'self'", 'data:', 'blob:', 'https:'])
    })

    it('allowlists Google Fonts for Material Symbols', () => {
      expect(header['style-src']).toContain('https://fonts.googleapis.com')
      expect(header['font-src']).toContain('https://fonts.gstatic.com')
    })

    it('frames WalletConnect, Intercom, and the commemorative renderer', () => {
      expect(header['frame-src']).toContain('https://*.walletconnect.com')
      expect(header['frame-src']).toContain('https://*.intercom.io')
      expect(header['frame-src']).toContain('https://ens-renderer.pages.dev')
    })
  })

  describe('header vs. meta split', () => {
    it('emits header-only directives only in the header', () => {
      expect(header['frame-ancestors']).toEqual(["'none'"])
      expect(meta['frame-ancestors']).toBeUndefined()

      expect(header['report-to']).toEqual(['posthog'])
      expect(header['report-uri']?.[0]).toContain(
        'https://eu.i.posthog.com/report/',
      )
      expect(meta['report-to']).toBeUndefined()
      expect(meta['report-uri']).toBeUndefined()
    })

    it('keeps upgrade-insecure-requests in both (valid in a meta tag)', () => {
      expect(header).toHaveProperty('upgrade-insecure-requests')
      expect(meta).toHaveProperty('upgrade-insecure-requests')
    })

    it('omits frame-ancestors from the meta policy', () => {
      expect(
        buildCspWithoutFrameAncestors({ nonce: TEST_NONCE }),
      ).not.toContain('frame-ancestors')
    })
  })

  describe('originFromEnvUrl', () => {
    it('extracts the origin from an absolute URL, dropping path/query', () => {
      expect(
        originFromEnvUrl('https://rpc.example.com/sepolia/secret-key?x=1'),
      ).toBe('https://rpc.example.com')
    })

    it('keeps a non-default port in the origin', () => {
      expect(originFromEnvUrl('http://127.0.0.1:5655/graphql')).toBe(
        'http://127.0.0.1:5655',
      )
    })

    it('returns null for unset, relative, or non-http(s) values', () => {
      expect(originFromEnvUrl(undefined)).toBeNull()
      expect(originFromEnvUrl('')).toBeNull()
      expect(originFromEnvUrl('/rpc')).toBeNull()
      expect(originFromEnvUrl('ws://relay.example.com')).toBeNull()
      expect(originFromEnvUrl('not a url')).toBeNull()
    })
  })

  describe('withSecurityHeaders', () => {
    it('sets the CSP and standard security headers', () => {
      const result = withSecurityHeaders(new Response('hi'), {
        nonce: TEST_NONCE,
      })

      expect(result.headers.get('Content-Security-Policy')).toBe(
        buildCspWithFrameAncestors({ nonce: TEST_NONCE }),
      )
      expect(result.headers.get('Reporting-Endpoints')).toMatch(
        /^posthog="https:\/\/eu\.i\.posthog\.com\/report\//,
      )
      expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(result.headers.get('Referrer-Policy')).toBe(
        'strict-origin-when-cross-origin',
      )
      expect(result.headers.get('Permissions-Policy')).toBe(
        'geolocation=(), microphone=(), camera=()',
      )
    })

    it('preserves the original response body and status', async () => {
      const result = withSecurityHeaders(
        new Response('body', { status: 201, statusText: 'Created' }),
        { nonce: TEST_NONCE },
      )
      expect(result.status).toBe(201)
      expect(await result.text()).toBe('body')
    })
  })
})
