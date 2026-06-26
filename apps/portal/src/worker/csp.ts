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
 *
 * Violations are reported to PostHog (see `POSTHOG_CSP_REPORT_ENDPOINT`) via the
 * `report-to` / `report-uri` directives plus a `Reporting-Endpoints` header.
 */

/**
 * Extract the `scheme://host[:port]` origin from a build-time env URL so it can
 * be allowlisted in `connect-src`.
 *
 * `VITE_SEPOLIA_RPC_URL` and `VITE_INDEXER_GRAPHQL_URL` are inlined by Vite at
 * build time and can point a deployment's RPC / indexer at a host outside the
 * static list below. Without this, the browser would enforce the static
 * `connect-src` and block those configured requests even though the app
 * accepted the override.
 *
 * Returns `null` for unset, relative (`/rpc` — already covered by `'self'`), or
 * unparseable values, so only real absolute http(s) overrides are added.
 */
export function originFromEnvUrl(value: string | undefined): string | null {
  if (!value || value.startsWith('/')) return null
  try {
    const { protocol, origin } = new URL(value)
    return protocol === 'https:' || protocol === 'http:' ? origin : null
  } catch {
    return null
  }
}

// Deployment-specific override origins, derived from the same build-time envs
// the RPC/indexer clients read (lib/wagmi.ts, packages/indexer/urql/client.ts).
const OVERRIDE_CONNECT_ORIGINS = [
  originFromEnvUrl(import.meta.env?.VITE_SEPOLIA_RPC_URL),
  originFromEnvUrl(import.meta.env?.VITE_INDEXER_GRAPHQL_URL),
].filter((origin): origin is string => origin !== null)

// Hosts the SPA opens network connections to (fetch / XHR / WebSocket).
// Keep this list tight and annotated; a missing host silently breaks a flow.
// Per-deployment overrides via VITE_SEPOLIA_RPC_URL / VITE_INDEXER_GRAPHQL_URL
// are appended automatically (see OVERRIDE_CONNECT_ORIGINS / CONNECT_HOSTS).
const DEFAULT_CONNECT_HOSTS = [
  // default Sepolia RPC — packages/indexer/chain.ts
  'https://lb.drpc.live',
  // ENS-owned hosts: indexer GraphQL (graphql.ens.dev — packages/indexer/
  // urql/client.ts) and the fund/faucet API (app-api.ens.dev —
  // src/hooks/useFundWallet.ts). Wildcarded so per-deployment / per-env
  // *.ens.dev hosts (and future ones) don't silently break a flow.
  'https://*.ens.dev',
  // ENS subgraph (ensjs default Sepolia endpoint) — @ensdomains/ensjs/subgraph
  'https://api.sepolia.ensnode.io',
  // ENS-owned *.ens.domains hosts: the DNSSEC oracle/gateway (DNS import flow)
  // and the PostHog analytics host (jakob.ens.domains — .env
  // VITE_PUBLIC_POSTHOG_HOST). Wildcarded for the same reason as *.ens.dev.
  // NOTE: PostHog's script bundle is allowed separately via SCRIPT_HOSTS, which
  // stays an exact host — script-src must not use a wildcard.
  'https://*.ens.domains',
  // DNS-over-HTTPS resolver — src/features/profile/hooks/useDnsSecEnabled.ts
  'https://1.1.1.1',
  // Etherscan API — proxy-contract verification fetch in
  // src/utils/blockExplorer/verifyProxyContract.ts (resolver/registry deploy).
  // Host comes from the viem chain's blockExplorers.default.apiUrl: Sepolia
  // today (api-sepolia), mainnet after cutover (api).
  'https://api-sepolia.etherscan.io',
  'https://api.etherscan.io',
  // ENS Cloudflare Workers (OG image, metadata, and other ENS-owned workers).
  'https://*.ens-cf.workers.dev',
  // IPFS gateways for NFT-metadata JSON resolution — viem's default (ipfs.io)
  // and the ENS gateway (worker/ens.ts). These are fetch() calls (connect-src);
  // the resolved avatar image itself is rendered via <img> and is covered by
  // the broad `img-src https:` below, so image hosts need no connect-src entry.
  'https://ipfs.io',
  'https://ipfs.euc.li',
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

// Static defaults plus any deployment-specific override origins. Deduped so an
// override that matches a default doesn't appear twice.
const CONNECT_HOSTS = [
  ...new Set<string>([...DEFAULT_CONNECT_HOSTS, ...OVERRIDE_CONNECT_ORIGINS]),
]

// PostHog also loads its script bundle from the analytics host.
const SCRIPT_HOSTS = ['https://jakob.ens.domains'] as const

// SHA-256 hashes of the inline scripts we allow (avoids 'unsafe-inline'). The
// browser logs the expected hash in the CSP violation when it blocks a script.
const INLINE_SCRIPT_HASHES = [
  // theme-init script in index.html — regenerate if that script changes.
  "'sha256-dvxYa7VmoGYAPR03Kp8okAGePv+XjpmficO2jq/Ia9g='",
  // PostHog's inline bootstrap loader (posthog-js). This hash is tied to the
  // posthog-js version, so it MUST be regenerated when posthog-js is upgraded —
  // the new expected hash appears in the script-src-elem CSP violation.
  "'sha256-aKAwvWwisgzRhW5auVEe5FrNQ3wlLsxZvLvimiQ3+os='",
] as const

// Directives shared by the header and the meta tag.
const BASE_DIRECTIVES = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' permits WebAssembly compilation (needed by some
  // wallet/crypto dependencies) WITHOUT enabling general 'unsafe-eval'.
  `script-src 'self' 'wasm-unsafe-eval' ${SCRIPT_HOSTS.join(' ')} ${INLINE_SCRIPT_HASHES.join(' ')}`,
  // 'unsafe-inline' styles: required by Tailwind / CSS-in-JS runtime injection.
  "style-src 'self' 'unsafe-inline'",
  // Images are intentionally host-agnostic: an ENS avatar record is an
  // arbitrary user-supplied URL, so any host is valid and we keep no image
  // host allowlist. Only https: (plus data:/blob:) is listed — http: is
  // pointless here because `upgrade-insecure-requests` below rewrites http:
  // subresources to https:, and browsers block mixed content on https pages
  // regardless, so a plaintext http: image can never actually load.
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
] as const

// PostHog CSP-violation reporting endpoint, visualized by PostHog's "CSP
// violations" dashboard template. Points directly at PostHog's EU cloud, not our
// jakob.ens.domains analytics proxy — that proxy can't serve /report/ (confirmed
// with its maintainer), at the cost of a few reports lost to ad-blockers. The
// token is the public client key (VITE_PUBLIC_POSTHOG_KEY); the trailing slash
// is required.
const POSTHOG_CSP_REPORT_ENDPOINT = `https://eu.i.posthog.com/report/?token=${import.meta.env.VITE_PUBLIC_POSTHOG_KEY}`

// Directives the browser ignores inside a <meta> tag, so they're header-only:
// frame-ancestors is invalid there, and report-to/report-uri only fire from the
// HTTP header. `report-to posthog` names the `Reporting-Endpoints` endpoint set
// in `withSecurityHeaders`; `report-uri` is the legacy fallback.
const HEADER_ONLY_DIRECTIVES = [
  "frame-ancestors 'none'",
  'report-to posthog',
  `report-uri ${POSTHOG_CSP_REPORT_ENDPOINT}`,
] as const

/** CSP for the `<meta http-equiv>` tag (omits frame-ancestors). */
export const cspWithoutFrameAncestors = BASE_DIRECTIVES.join('; ')

/** Full CSP for the HTTP header. */
export const cspWithFrameAncestors = `${[...BASE_DIRECTIVES, ...HEADER_ONLY_DIRECTIVES].join('; ')};`

/** A `<meta>` tag carrying the CSP, for injection into every HTML `<head>`. */
export const cspMetaTag = `<meta http-equiv="Content-Security-Policy" content="${cspWithoutFrameAncestors}" />`

/** Apply CSP + standard security headers to any response the worker returns. */
export function withSecurityHeaders(response: Response): Response {
  // Responses from `env.ASSETS.fetch()` have immutable headers; re-wrap so the
  // headers are mutable (HTMLRewriter / `new Response` results pass through too).
  const result = new Response(response.body, response)
  result.headers.set('Content-Security-Policy', cspWithFrameAncestors)
  // Names the `posthog` endpoint that the `report-to` CSP directive targets.
  result.headers.set(
    'Reporting-Endpoints',
    `posthog="${POSTHOG_CSP_REPORT_ENDPOINT}"`,
  )
  result.headers.set('X-Frame-Options', 'DENY')
  result.headers.set('X-Content-Type-Options', 'nosniff')
  result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  result.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()',
  )
  return result
}
