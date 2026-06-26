import { describe, expect, it } from 'vitest'
import {
  cspMetaTag,
  cspWithFrameAncestors,
  cspWithoutFrameAncestors,
  originFromEnvUrl,
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

    it('pins the inline-script hashes (theme init + PostHog bootstrap)', () => {
      // Hardcoded sha256 hashes let specific inline scripts run without
      // 'unsafe-inline'. The PostHog one is version-tied — regenerate on upgrade.
      expect(header['script-src']).toContain(
        "'sha256-dvxYa7VmoGYAPR03Kp8okAGePv+XjpmficO2jq/Ia9g='",
      )
      expect(header['script-src']).toContain(
        "'sha256-aKAwvWwisgzRhW5auVEe5FrNQ3wlLsxZvLvimiQ3+os='",
      )
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

  describe('connect-src allowlist', () => {
    const connectSrc = header['connect-src'] ?? []

    it("starts from 'self'", () => {
      expect(connectSrc).toContain("'self'")
    })

    it('allows ENS-owned hosts via the *.ens.dev wildcard', () => {
      // Covers graphql.ens.dev (indexer) and app-api.ens.dev (faucet), plus any
      // per-env *.ens.dev host. The bare hosts must NOT be listed separately —
      // the wildcard is the single source of truth.
      expect(connectSrc).toContain('https://*.ens.dev')
      expect(connectSrc).not.toContain('https://graphql.ens.dev')
      expect(connectSrc).not.toContain('https://app-api.ens.dev')
    })

    it('allows ENS *.ens.domains hosts (DNSSEC oracle, PostHog)', () => {
      expect(connectSrc).toContain('https://*.ens.domains')
      // Collapsed into the wildcard — no standalone PostHog host entry.
      expect(connectSrc).not.toContain('https://jakob.ens.domains')
    })

    it('allows ENS Cloudflare Workers via *.ens-cf.workers.dev', () => {
      expect(connectSrc).toContain('https://*.ens-cf.workers.dev')
    })

    it('allows the Etherscan API hosts used by proxy verification', () => {
      // verifyProxyContract fetches chain.blockExplorers.default.apiUrl:
      // Sepolia now, mainnet after cutover.
      expect(connectSrc).toContain('https://api-sepolia.etherscan.io')
      expect(connectSrc).toContain('https://api.etherscan.io')
    })

    it('does not allowlist image-only hosts in connect-src', () => {
      // Avatars/images load via <img> (covered by `img-src https:`), so image
      // CDNs must never leak into connect-src (regression guard for i.pinimg.com).
      expect(connectSrc).not.toContain('https://i.pinimg.com')
    })

    it('allows the Sepolia RPC and indexer subgraph', () => {
      expect(connectSrc).toContain('https://lb.drpc.live')
      expect(connectSrc).toContain('https://api.sepolia.ensnode.io')
    })

    it('allows the five L2 Sepolia RPCs for L2 setName', () => {
      for (const host of [
        'https://sepolia.optimism.io',
        'https://sepolia-rollup.arbitrum.io',
        'https://sepolia.base.org',
        'https://rpc.sepolia.linea.build',
        'https://sepolia-rpc.scroll.io',
      ]) {
        expect(connectSrc).toContain(host)
      }
    })

    it('allows WalletConnect relay over https and wss', () => {
      expect(connectSrc).toContain('https://*.walletconnect.com')
      expect(connectSrc).toContain('wss://*.walletconnect.com')
      expect(connectSrc).toContain('https://*.walletconnect.org')
      expect(connectSrc).toContain('wss://*.walletconnect.org')
    })

    it('keeps image loading host-agnostic (any https host)', () => {
      // An ENS avatar record is an arbitrary user-supplied URL, so images are
      // never host-checked: img-src allows any host over https:. http: is
      // omitted on purpose — upgrade-insecure-requests rewrites it to https:
      // and browsers block mixed content on https pages anyway, so a plaintext
      // http: image can never load. This is why avatar/record image hosts never
      // need a connect-src or img-src entry.
      expect(header['img-src']).toEqual(["'self'", 'data:', 'blob:', 'https:'])
    })
  })

  describe('originFromEnvUrl (deployment override origins)', () => {
    it('extracts the origin from an absolute https URL, dropping path/query', () => {
      // RPC override carries an API key in the path; only the origin is allowed.
      expect(
        originFromEnvUrl('https://rpc.example.com/sepolia/secret-key?x=1'),
      ).toBe('https://rpc.example.com')
    })

    it('keeps a non-default port in the origin', () => {
      expect(originFromEnvUrl('http://127.0.0.1:5655/graphql')).toBe(
        'http://127.0.0.1:5655',
      )
    })

    it('returns null for unset / relative / non-http values', () => {
      // Relative paths resolve to the page origin (already covered by 'self').
      expect(originFromEnvUrl(undefined)).toBeNull()
      expect(originFromEnvUrl('')).toBeNull()
      expect(originFromEnvUrl('/rpc')).toBeNull()
      expect(originFromEnvUrl('/indexer/graphql')).toBeNull()
      expect(originFromEnvUrl('ws://relay.example.com')).toBeNull()
      expect(originFromEnvUrl('not a url')).toBeNull()
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
