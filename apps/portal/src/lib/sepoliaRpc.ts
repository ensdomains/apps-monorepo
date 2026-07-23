/**
 * Public Sepolia fallback endpoints shared by the browser wagmi config
 * (src/lib/wagmi.ts) and the SSR/OG worker client (src/worker/clients.ts).
 *
 * dRPC (each surface's primary) intermittently returns HTTP 500s on
 * otherwise-valid `eth_call`s; viem's `fallback()` transport transparently
 * fails over to these so a single provider blip doesn't surface as a query
 * error (or a broken preview card). Tenderly is used over 1rpc.io (which the
 * manager app uses) because 1rpc's free tier rate-limits quickly; together
 * with the dRPC primary all three endpoints are separate providers, so their
 * failure modes are uncorrelated.
 *
 * Deliberately dependency-free: the worker must not import src/lib/wagmi.ts
 * (it would drag the WalletConnect connector and other browser-only code into
 * the worker bundle), so the shared piece lives here.
 */
export const SEPOLIA_FALLBACK_RPC_URLS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://sepolia.gateway.tenderly.co',
] as const

/** Primary-first, deduped URL list for viem's `fallback()` transport. */
export const orderedSepoliaRpcUrls = (primary: string): readonly string[] => [
  primary,
  ...SEPOLIA_FALLBACK_RPC_URLS.filter((url) => url !== primary),
]
