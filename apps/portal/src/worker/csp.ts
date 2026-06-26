/**
 * Content-Security-Policy + security headers for the portal worker.
 *
 * The portal is served by this Cloudflare Worker only in production
 * (`vite.config.ts` mounts `cloudflare()` only when `mode !== 'development'`),
 * so applying CSP here automatically exempts the Vite dev server / HMR.
 *
 * The policy is delivered two ways (see `worker.ts`):
 *   - as an HTTP `Content-Security-Policy` header on every response, and
 *   - as a `<meta http-equiv>` tag injected into every HTML `<head>`.
 * `frame-ancestors` is invalid inside a `<meta>` tag (browsers ignore it there),
 * so the meta variant omits it — hence the two exported strings.
 */

// Hosts the SPA opens network connections to (fetch / XHR / WebSocket).
// Keep this list tight and annotated; a missing host silently breaks a flow.
// NOTE: VITE_SEPOLIA_RPC_URL and VITE_INDEXER_GRAPHQL_URL can override the RPC
// and indexer hosts per deployment — overriding them requires updating this list.
const CONNECT_HOSTS = [
  // default Sepolia RPC — packages/indexer/chain.ts
  'https://lb.drpc.live',
  // indexer GraphQL — packages/indexer/urql/client.ts
  'https://graphql.ens.dev',
  // ENS subgraph (ensjs default Sepolia endpoint) — @ensdomains/ensjs/subgraph
  'https://api.sepolia.ensnode.io',
  // wallet fund / faucet API — src/hooks/useFundWallet.ts
  'https://app-api.ens.dev',
  // DNSSEC DNS-over-HTTPS — src/features/profile/hooks/useDnsSecEnabled.ts
  'https://1.1.1.1',
  // PostHog analytics host — .env (VITE_PUBLIC_POSTHOG_HOST)
  'https://jakob.ens.domains',
  // WalletConnect / RainbowKit relay, verify, pulse, explorer-api
  'https://*.walletconnect.com',
  'wss://*.walletconnect.com',
  'https://*.walletconnect.org',
  'wss://*.walletconnect.org',
  // viem default public L2 RPCs for L2 setName — src/lib/wagmiL2.ts
  'https://sepolia.optimism.io',
  'https://sepolia-rollup.arbitrum.io',
  'https://sepolia.base.org',
  'https://rpc.sepolia.linea.build',
  'https://sepolia-rpc.scroll.io',
] as const

// PostHog also loads its script bundle from the analytics host.
const SCRIPT_HOSTS = ['https://jakob.ens.domains'] as const

// SHA-256 of the inline theme-init script in index.html (avoids 'unsafe-inline').
// If that script changes, regenerate this — the browser logs the expected hash
// in the CSP violation when it blocks the script.
const INLINE_THEME_SCRIPT_HASH =
  "'sha256-dvxYa7VmoGYAPR03Kp8okAGePv+XjpmficO2jq/Ia9g='"

// Directives shared by the header and the meta tag.
const baseDirectives = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' permits WebAssembly compilation (needed by some
  // wallet/crypto dependencies) WITHOUT enabling general 'unsafe-eval'.
  `script-src 'self' 'wasm-unsafe-eval' ${SCRIPT_HOSTS.join(' ')} ${INLINE_THEME_SCRIPT_HASH}`,
  // 'unsafe-inline' styles: required by Tailwind / CSS-in-JS runtime injection.
  "style-src 'self' 'unsafe-inline'",
  // Broad https: is intentional — ENS avatar records are arbitrary user URLs.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${CONNECT_HOSTS.join(' ')}`,
  // WalletConnect renders its verify/modal in iframes.
  "frame-src 'self' https://*.walletconnect.com https://*.walletconnect.org",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Valid in both the header and a <meta> tag; upgrades any http subresource
  // request to https.
  'upgrade-insecure-requests',
]

// `frame-ancestors` is the only directive that's invalid inside a <meta> tag,
// so it's the sole header-only entry.
const headerOnlyDirectives = [
  // 'self' pairs with `X-Frame-Options: SAMEORIGIN` (set below) — same-origin
  // framing only. The two MUST agree (CSP wins in modern browsers, XFO in
  // legacy ones).
  "frame-ancestors 'self'",
]

/** CSP for the `<meta http-equiv>` tag (omits frame-ancestors). */
export const cspWithoutFrameAncestors = `${baseDirectives.join('; ')};`

/** Full CSP for the HTTP header. */
export const cspWithFrameAncestors = `${[...baseDirectives, ...headerOnlyDirectives].join('; ')};`

/** A `<meta>` tag carrying the CSP, for injection into every HTML `<head>`. */
export const cspMetaTag = `<meta http-equiv="Content-Security-Policy" content="${cspWithoutFrameAncestors}" />`

/** Apply CSP + standard security headers to any response the worker returns. */
export function withSecurityHeaders(response: Response): Response {
  // Responses from `env.ASSETS.fetch()` have immutable headers; re-wrap so the
  // headers are mutable (HTMLRewriter / `new Response` results pass through too).
  const result = new Response(response.body, response)
  result.headers.set('Content-Security-Policy', cspWithFrameAncestors)
  // SAMEORIGIN (not DENY) to agree with `frame-ancestors 'self'` above.
  result.headers.set('X-Frame-Options', 'SAMEORIGIN')
  result.headers.set('X-Content-Type-Options', 'nosniff')
  result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  result.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()',
  )
  return result
}
