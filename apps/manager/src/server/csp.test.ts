import { originFromEnvUrl } from '@ens-apps/config'
import { describe, expect, it } from 'vitest'
import { envConfig } from '@/config'
import {
  buildCsp,
  CSP_HEADER_NAME,
  CSP_REPORT_ONLY,
  SECURITY_HEADER_VALUES,
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

const header = parseDirectives(buildCsp(TEST_NONCE))

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
      expect(SECURITY_HEADER_VALUES['X-Frame-Options']).toBe('DENY')
    })
  })

  describe('connect-src wildcard collapse', () => {
    const connectSrc = header['connect-src'] ?? []

    it("starts from 'self'", () => {
      expect(connectSrc).toContain("'self'")
    })

    it('allowlists every shared RPC failover origin', () => {
      for (const url of envConfig.rpcFallbacks) {
        expect(connectSrc).toContain(new URL(url).origin)
      }
      expect(connectSrc).toContain('https://lb.drpc.live')
    })

    it('collapses ENS hosts into wildcards rather than listing them bare', () => {
      // The wildcard is the single source of truth in the static defaults.
      // Build-time VITE_API_URL may still append an exact origin via
      // OVERRIDE_CONNECT_ORIGINS (e.g. sepolia.app-api.ens.domains from .env) — that's fine.
      expect(connectSrc).toContain('https://*.ens.dev')
      expect(connectSrc).not.toContain('https://graphql.ens.dev')

      expect(connectSrc).toContain('https://*.ens.domains')
      expect(connectSrc).not.toContain('https://edge.ens.domains')
    })

    it('allowlists Rhinestone and Intercom hosts', () => {
      expect(connectSrc).toContain('https://*.rhinestone.dev')
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

    it('allows fetching immutable commemorative NFT metadata from R2', () => {
      expect(connectSrc).toContain('https://v2.nft-assets.ens.domains')
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

    it('allowlists the font host serving the ABC/Dinamo faces', () => {
      expect(header['font-src']).toContain('https://fonts.ens.dev')
    })

    it('frames WalletConnect, Intercom, and the commemorative renderer', () => {
      expect(header['frame-src']).toContain('https://*.walletconnect.com')
      expect(header['frame-src']).toContain('https://*.intercom.io')
      expect(header['frame-src']).toContain('https://v2.nft.ens.domains')
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

  describe('security headers', () => {
    it('sets the standard baselines', () => {
      expect(SECURITY_HEADER_VALUES).toEqual({
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      })
    })
  })

  describe('runtime-resolved origins', () => {
    it('allowlists both DNS-over-HTTPS hosts ensjs may use', () => {
      // cloudflare-dns.com and 1.1.1.1 are the same service on different
      // hosts; CSP matches on host, so listing only one fails closed and
      // surfaces as "Invalid TLD" rather than a visible network error.
      expect(header['connect-src']).toContain('https://cloudflare-dns.com')
      expect(header['connect-src']).toContain('https://1.1.1.1')
    })

    it('allowlists the CCIP-read batch and verifier gateways', () => {
      // viem fans OffchainLookup batches out to these from the browser; a miss
      // surfaces as ResolverError("HTTP request failed."), not a CSP error.
      expect(header['connect-src']).toContain('https://*.ens.xyz')
      expect(header['connect-src']).toContain('https://*.3668.io')
      expect(header['connect-src']).toContain('https://lb.drpc.org')
    })

    it('allowlists every subgraph origin ensjs resolves internally', async () => {
      const { ensL1Subgraphs } = await import('@ensdomains/ensjs/chain')
      for (const { ens } of Object.values(ensL1Subgraphs)) {
        expect(header['connect-src']).toContain(new URL(ens.url).origin)
      }
    })

    it('allowlists every fallback RPC the viem transport can reach', () => {
      for (const url of envConfig.rpcFallbacks) {
        expect(header['connect-src']).toContain(new URL(url).origin)
      }
    })
  })

  describe('rollout mode', () => {
    it('defaults to report-only so an unflagged build cannot break prod', () => {
      expect(CSP_REPORT_ONLY).toBe(true)
      expect(CSP_HEADER_NAME).toBe('Content-Security-Policy-Report-Only')
    })

    it('disables the PostHog reporting destination without changing the policy', () => {
      expect(header['report-to']).toBeUndefined()
      expect(header['report-uri']).toBeUndefined()
      expect(header['frame-ancestors']).toEqual(["'none'"])
    })
  })
})

describe('indexers', () => {
  it('allows the bigname origin resolved from config', () => {
    const origin = originFromEnvUrl(envConfig.endpoints.bignameApi)

    expect(origin).toBeTruthy()
    expect(header['connect-src']).toContain(origin)
  })
})
