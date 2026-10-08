/**
 * Content-Security-Policy + security headers for the manager app.
 *
 * Delivered as an HTTP header by the request middleware in `src/start.ts`,
 * production only — Vite HMR needs the eval/ws this policy forbids.
 *
 * Unlike portal (static SPA), manager SSRs its hydration scripts, so
 * `script-src` is nonce + `strict-dynamic` based. Violations are reported to
 * PostHog via `report-to` / `report-uri` + `Reporting-Endpoints`.
 */

import { originFromEnvUrl } from '@ens-apps/config'
import { ensL1Subgraphs } from '@ensdomains/ensjs/chain'
import { envConfig } from '@/config'

import { getCommemorativeNftConfig } from '@/features/migration/commemorative-nft/config'

// DQA overlay origin (QA/preview builds only): needed in script-src and
// connect-src (https + wss). Statically null unless the build sets VITE_DQA=1.
const DQA_ORIGIN =
  import.meta.env?.VITE_DQA === '1'
    ? (originFromEnvUrl(import.meta.env?.VITE_DQA_URL) ??
      'http://localhost:4000')
    : null

const COMMEMORATIVE_RENDERER_ORIGIN = getCommemorativeNftConfig().rendererOrigin
const COMMEMORATIVE_ASSET_ORIGIN = getCommemorativeNftConfig().assetOrigin

// Deployment-specific override origins for the endpoints config does not own.
// The RPC and indexer overrides are already folded into `config`, so they are
// covered below rather than read from env a second time.
const OVERRIDE_CONNECT_ORIGINS = [
  originFromEnvUrl(import.meta.env?.VITE_TIME_TRAVEL_RPC),
  originFromEnvUrl(import.meta.env?.VITE_API_URL),
  originFromEnvUrl(import.meta.env?.VITE_RHINESTONE_ENDPOINT_URL),
  COMMEMORATIVE_ASSET_ORIGIN,
  DQA_ORIGIN,
  DQA_ORIGIN?.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:'),
].filter((origin): origin is string => origin != null)

// Subgraph endpoints ensjs resolves internally (getNameHistory). Derived from
// its own chain config so the mainnet cutover can't silently fail closed.
const SUBGRAPH_ORIGINS = Object.values(ensL1Subgraphs).map(
  ({ ens }) => new URL(ens.url).origin,
)

// Hosts the SPA opens network connections to (fetch / XHR / WebSocket).
// Keep this list tight and annotated; a missing host silently breaks a flow.
const DEFAULT_CONNECT_HOSTS = [
  // Every RPC endpoint the viem transports may use: the app's attributed
  // primary plus the network's shared fallbacks. Derived from the same config
  // the transports read, so an endpoint change can never be silently blocked.
  // Relative primaries (`/rpc` in e2e) yield null and are covered by 'self'.
  ...envConfig.rpcUrls
    .map(originFromEnvUrl)
    .filter((origin): origin is string => origin !== null),
  // The indexers, resolved in `@/config`.
  ...[
    originFromEnvUrl(envConfig.endpoints.indexerGraphql),
    originFromEnvUrl(envConfig.endpoints.bignameApi),
  ].filter((origin): origin is string => origin !== null),
  // ENS-owned hosts: indexer GraphQL, backend API (VITE_API_URL /
  // sepolia.app-api.ens.domains), v1 subgraph (v1-graphql.ens.dev). The
  // wildcard families cover per-deployment and per-environment hosts.
  'https://*.ens.dev',
  // ENS-owned *.ens.domains: metadata avatar gateway, PostHog analytics host
  // (edge.ens.domains — VITE_PUBLIC_POSTHOG_HOST).
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
  // DNS-over-HTTPS — ensjs `getDnsTxtRecords` (utils/dnssec) defaults to
  // cloudflare-dns.com. Both hosts: CSP matches on host, not on service.
  'https://cloudflare-dns.com',
  'https://1.1.1.1',
  // CCIP-Read (ERC-3668) gateways — viem follows OffchainLookup reverts from
  // the browser, so a miss surfaces as ResolverError("HTTP request failed").
  // The UR's batch gateway (*.ens.xyz) fans out to Unruggable's *.3668.io and
  // its mirror lb.drpc.org (distinct from the lb.drpc.live RPC above).
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
// edge.ens.domains analytics proxy can't serve /report/). Trailing slash is
// required; token is the public client key.
export const POSTHOG_CSP_REPORT_ENDPOINT = `https://eu.i.posthog.com/report/?token=${import.meta.env.VITE_PUBLIC_POSTHOG_KEY}`

/**
 * Report-only unless the build sets `VITE_CSP_ENFORCE=1`. A miss in the
 * allowlist fails closed and silently, so collect real-traffic violations from
 * the PostHog dashboard first, then flip to enforcing.
 */
export const CSP_REPORT_ONLY = import.meta.env?.VITE_CSP_ENFORCE !== '1'

/** The response header the policy is delivered under. */
export const CSP_HEADER_NAME = CSP_REPORT_ONLY
  ? 'Content-Security-Policy-Report-Only'
  : 'Content-Security-Policy'

/** Builds the policy for `nonce`, which TanStack stamps onto SSR scripts. */
export function buildCsp(nonce: string): string {
  return `${[
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
    // fonts.ens.dev serves the ABC/Dinamo faces: the font license forbids
    // redistributing them in this repo, so they are fetched at runtime rather
    // than vendored under src/assets/fonts.
    "font-src 'self' data: https://fonts.gstatic.com https://fonts.ens.dev",
    `connect-src 'self' ${CONNECT_HOSTS.join(' ')}`,
    `frame-src 'self' ${FRAME_HOSTS.join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
    "frame-ancestors 'none'",
    // `report-to` names the endpoint set in the `Reporting-Endpoints` header
    // (src/start.ts); `report-uri` is the legacy fallback.
    'report-to posthog',
    `report-uri ${POSTHOG_CSP_REPORT_ENDPOINT}`,
  ].join('; ')};`
}

/** Standard security headers applied alongside CSP (portal parity). */
export const SECURITY_HEADER_VALUES = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
} as const
