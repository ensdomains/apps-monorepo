/**
 * Content-Security-Policy + security headers for the manager app.
 *
 * Manager is served by TanStack Start on Cloudflare Workers
 * (`wrangler.jsonc` → `@tanstack/react-start/server-entry`). The policy is
 * applied two ways:
 *   - as an HTTP `Content-Security-Policy` header via request middleware in
 *     `src/start.ts` (production only — Vite HMR needs eval/ws in dev), and
 *   - as a `<meta http-equiv>` tag from `routes/__root.tsx` `head()`.
 *
 * `frame-ancestors` is invalid inside a `<meta>` tag (browsers ignore it
 * there), so the meta variant omits it — hence the two builders.
 *
 * Unlike portal (static SPA + custom worker), manager SSR injects hydration
 * scripts, so `script-src` is nonce + `strict-dynamic` based. Violations are
 * reported to PostHog via `report-to` / `report-uri` + `Reporting-Endpoints`.
 */

import { SEPOLIA_FALLBACK_RPC_URLS } from '@ens-apps/indexer/chain'
import { ensL1Subgraphs } from '@ensdomains/ensjs/chain'
import { getGlobalStartContext } from '@tanstack/react-start'
import { DEFAULT_COMMEMORATIVE_NFT_RENDERER_ORIGIN } from '@/features/migration/commemorative-nft/config'

/**
 * Extract the `scheme://host[:port]` origin from a build-time env URL so it can
 * be allowlisted in `connect-src` / `frame-src`.
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

// DQA overlay origin (QA/preview builds only): needed in script-src and
// connect-src (https + wss). Statically null unless the build sets VITE_DQA=1.
const DQA_ORIGIN =
  import.meta.env?.VITE_DQA === '1'
    ? (originFromEnvUrl(import.meta.env?.VITE_DQA_URL) ??
      'http://localhost:4000')
    : null

const COMMEMORATIVE_RENDERER_ORIGIN =
  originFromEnvUrl(import.meta.env?.VITE_COMMEMORATIVE_NFT_RENDERER_ORIGIN) ??
  DEFAULT_COMMEMORATIVE_NFT_RENDERER_ORIGIN

// Deployment-specific override origins, derived from the same build-time envs
// the RPC / indexer / Rhinestone / NFT clients read.
const OVERRIDE_CONNECT_ORIGINS = [
  originFromEnvUrl(import.meta.env?.VITE_SEPOLIA_RPC_URL),
  originFromEnvUrl(import.meta.env?.VITE_INDEXER_GRAPHQL_URL),
  originFromEnvUrl(import.meta.env?.VITE_TIME_TRAVEL_RPC),
  originFromEnvUrl(import.meta.env?.VITE_API_URL),
  originFromEnvUrl(import.meta.env?.VITE_RHINESTONE_ENDPOINT_URL),
  originFromEnvUrl(import.meta.env?.VITE_COMMEMORATIVE_NFT_ASSET_ORIGIN),
  originFromEnvUrl(import.meta.env?.VITE_COMMEMORATIVE_NFT_ELIGIBILITY_ORIGIN),
  DQA_ORIGIN,
  DQA_ORIGIN?.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:'),
].filter((origin): origin is string => origin != null)

// Subgraph origins, derived from ensjs' own chain config rather than hardcoded.
// `getNameHistory` (@ensdomains/ensjs/subgraph, used by profileRegistration.ts)
// resolves its endpoint from this table, so the host is ensjs' to change: it is
// v1-graphql.ens.dev on Sepolia today but a *.ensnode.io host on mainnet.
// Deriving both means the mainnet cutover can't silently fail closed.
const SUBGRAPH_ORIGINS = Object.values(ensL1Subgraphs).map(
  ({ ens }) => new URL(ens.url).origin,
)

// Hosts the SPA opens network connections to (fetch / XHR / WebSocket).
// Keep this list tight and annotated; a missing host silently breaks a flow.
const DEFAULT_CONNECT_HOSTS = [
  // Manager Sepolia RPC primary — src/lib/wagmi.ts
  'https://lb.drpc.live',
  // Public RPC failover endpoints — same source as viem transports
  // (@ens-apps/indexer/chain SEPOLIA_FALLBACK_RPC_URLS).
  ...SEPOLIA_FALLBACK_RPC_URLS.map((url) => new URL(url).origin),
  // ENS-owned hosts: indexer GraphQL, backend API (VITE_API_URL /
  // app-api.ens.dev), v1 subgraph (v1-graphql.ens.dev). Wildcarded so
  // per-deployment / per-env *.ens.dev hosts don't silently break a flow.
  'https://*.ens.dev',
  // ENS-owned *.ens.domains: metadata avatar gateway, PostHog analytics host
  // (jakob.ens.domains — VITE_PUBLIC_POSTHOG_HOST).
  'https://*.ens.domains',
  // Etherscan API — proxy-contract verification
  // (src/utils/blockExplorer/verifyProxyContract.ts).
  'https://api-sepolia.etherscan.io',
  'https://api.etherscan.io',
  // ENS Cloudflare Workers (avatar upload, metadata, preview APIs).
  'https://*.ens-cf.workers.dev',
  // IPFS gateways for NFT-metadata JSON — profileNfts / profileImageRecord.
  // Images themselves are covered by `img-src https:`.
  'https://ipfs.io',
  'https://ipfs.euc.li',
  // Alchemy NFT API — src/features/profile/service/profileNfts.ts
  'https://*.g.alchemy.com',
  // Rhinestone orchestrator (HCA intents) — @rhinestone/sdk default.
  'https://*.rhinestone.dev',
  // Intercom messenger — @intercom/messenger-js-sdk
  'https://*.intercom.io',
  'https://*.intercomcdn.com',
  'wss://*.intercom.io',
  // WalletConnect relay, verify, pulse, explorer-api
  'https://*.walletconnect.com',
  'wss://*.walletconnect.com',
  'https://*.walletconnect.org',
  'wss://*.walletconnect.org',
  // Reown AppKit (formerly Web3Modal) config + analytics API
  'https://api.web3modal.org',
  // Subgraph endpoints ensjs resolves internally (see SUBGRAPH_ORIGINS).
  ...SUBGRAPH_ORIGINS,
  // DNS-over-HTTPS resolvers — ensjs `getDnsTxtRecords` (via
  // @ens-apps/utils/dnssec, used by profile/service/dnsSecEnabled.ts) defaults
  // to cloudflare-dns.com. Portal shipped only 1.1.1.1 — the same service on a
  // different host, which CSP does not cover — and every DNS check failed
  // closed, rendering valid DNS names as "Invalid TLD". Both hosts are listed.
  'https://cloudflare-dns.com',
  'https://1.1.1.1',
  // CCIP-Read (ERC-3668) gateways — viem follows the UniversalResolver's
  // OffchainLookup reverts from the browser (getRecords in
  // profile/service/profileRecords.ts and profileEthAddress.ts), so every
  // gateway origin must be allowlisted or resolution fails with a generic
  // "HTTP request failed." buried in a ResolverError. The UR hands out the ENS
  // batch gateway (*.ens.xyz) tagged `x-batch-gateway:true`, which makes viem
  // fan the batch out to the per-chain verifier gateways directly: Unruggable's
  // *.3668.io and its drpc-load-balanced mirror lb.drpc.org (the gateway host —
  // distinct from the lb.drpc.live RPC above).
  'https://*.ens.xyz',
  'https://*.3668.io',
  'https://lb.drpc.org',
] as const

const CONNECT_HOSTS = [
  ...new Set<string>([...DEFAULT_CONNECT_HOSTS, ...OVERRIDE_CONNECT_ORIGINS]),
]

// No third-party script hosts in the static allowlist when using
// `'strict-dynamic'` + nonce (modern browsers ignore host allowlists once
// strict-dynamic is present). The DQA overlay is the exception for QA builds
// that load an external script before any nonce-bearing app script runs.
const SCRIPT_HOSTS = DQA_ORIGIN ? [DQA_ORIGIN] : []

const FRAME_HOSTS = [
  'https://*.walletconnect.com',
  'https://*.walletconnect.org',
  // Intercom messenger frames
  'https://*.intercom.io',
  // Commemorative NFT Three.js renderer iframe
  COMMEMORATIVE_RENDERER_ORIGIN,
]

// PostHog CSP-violation reporting endpoint. Points at PostHog EU cloud (the
// jakob.ens.domains analytics proxy can't serve /report/). Trailing slash is
// required; token is the public client key.
const POSTHOG_CSP_REPORT_ENDPOINT = `https://eu.i.posthog.com/report/?token=${import.meta.env.VITE_PUBLIC_POSTHOG_KEY}`

export type CspBuildOptions = {
  /** Per-request nonce for SSR / hydration scripts (TanStack Start). */
  readonly nonce: string
}

/** Directives shared by the header and the meta tag. */
function baseDirectives({ nonce }: CspBuildOptions): string[] {
  return [
    "default-src 'self'",
    // Nonce + strict-dynamic: TanStack Start stamps the nonce on framework
    // scripts; strict-dynamic then permits scripts those trusted scripts
    // insert (Intercom widget loader, etc.) WITHOUT 'unsafe-inline'.
    // 'wasm-unsafe-eval' permits WebAssembly (wallet/crypto deps) without
    // general 'unsafe-eval'.
    [
      'script-src',
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'wasm-unsafe-eval'",
      ...SCRIPT_HOSTS,
    ].join(' '),
    // 'unsafe-inline' styles: required by Tailwind runtime + Material Symbols
    // Google Fonts stylesheet (fonts.googleapis.com).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Images are host-agnostic (ENS avatar records are arbitrary URLs).
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${CONNECT_HOSTS.join(' ')}`,
    `frame-src 'self' ${FRAME_HOSTS.join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ]
}

const HEADER_ONLY_DIRECTIVES = [
  "frame-ancestors 'none'",
  'report-to posthog',
  `report-uri ${POSTHOG_CSP_REPORT_ENDPOINT}`,
] as const

/** CSP for the `<meta http-equiv>` tag (omits frame-ancestors / report-*). */
export function buildCspWithoutFrameAncestors(
  options: CspBuildOptions,
): string {
  return baseDirectives(options).join('; ')
}

/** Full CSP for the HTTP header. */
export function buildCspWithFrameAncestors(options: CspBuildOptions): string {
  return `${[...baseDirectives(options), ...HEADER_ONLY_DIRECTIVES].join('; ')};`
}

/**
 * Rollout mode. The policy ships as `Content-Security-Policy-Report-Only`
 * unless the build explicitly opts into enforcement with `VITE_CSP_ENFORCE=1`.
 *
 * This default is deliberate. The set of origins a page actually contacts is
 * decided at runtime by our dependencies, not by anything greppable: viem fans
 * CCIP-read batches out to whatever gateways the UniversalResolver returns,
 * ensjs picks its own DoH and subgraph hosts, wallet SDKs reach their own APIs.
 * A statically-authored allowlist is therefore always a guess, and every miss
 * fails closed and silently — it surfaces as a broken feature, not a CSP error.
 *
 * Portal learned this the hard way: it shipped enforcing, was reverted, and
 * then needed six follow-up prod fixes over two months (blocked deployment
 * override origins, a stale PostHog hash, the Reown AppKit host, PostHog's
 * runtime script injection, the CCIP-read gateways, and cloudflare-dns.com).
 *
 * Report-Only sends the identical policy but blocks nothing, while still
 * delivering violations to PostHog via `report-to` / `report-uri`. Run it
 * against real traffic, fix what the dashboard shows, then set
 * `VITE_CSP_ENFORCE=1` to turn it on for real.
 */
export const CSP_REPORT_ONLY = import.meta.env?.VITE_CSP_ENFORCE !== '1'

/**
 * The response header the policy is delivered under.
 *
 * NOTE: there is no `<meta>` equivalent of Report-Only — a `<meta http-equiv>`
 * CSP is *always* enforcing. That is why `routes/__root.tsx` omits the CSP meta
 * tag entirely while in report-only mode; emitting it would enforce the policy
 * in the browser while this header politely reported, which is exactly the
 * breakage the rollout is designed to avoid.
 */
export function cspHeaderName(reportOnly: boolean = CSP_REPORT_ONLY): string {
  return reportOnly
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy'
}

/** Per-request CSP nonce set by security-headers middleware in `src/start.ts`. */
export function getCspNonce(): string | undefined {
  return getGlobalStartContext()?.cspNonce
}

/** Standard security headers applied alongside CSP (portal parity). */
export const SECURITY_HEADER_VALUES = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
} as const

/** Apply CSP + standard security headers to any Response (tests / helpers). */
export function withSecurityHeaders(
  response: Response,
  options: CspBuildOptions,
): Response {
  const result = new Response(response.body, response)
  result.headers.set(cspHeaderName(), buildCspWithFrameAncestors(options))
  result.headers.set(
    'Reporting-Endpoints',
    `posthog="${POSTHOG_CSP_REPORT_ENDPOINT}"`,
  )
  for (const [name, value] of Object.entries(SECURITY_HEADER_VALUES)) {
    result.headers.set(name, value)
  }
  return result
}

export { POSTHOG_CSP_REPORT_ENDPOINT }
