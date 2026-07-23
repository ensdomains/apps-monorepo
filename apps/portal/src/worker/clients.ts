import { sepoliaWithEns } from '@ens-apps/indexer/chain'
import { createPublicClient, fallback, http } from 'viem'

// Public, keyless Sepolia endpoint used as the default primary when the
// SEPOLIA_RPC_URL secret is not configured (e.g. `wrangler dev` without a
// `.dev.vars`). Production sets SEPOLIA_RPC_URL as a Worker secret.
const DEFAULT_SEPOLIA_RPC_URL = 'https://sepolia.drpc.org'

// Runtime failover, mirroring the app config (src/lib/wagmi.ts): dRPC
// intermittently returns HTTP 500s on otherwise-valid `eth_call`s, and a
// failed OG/SSR read means a broken preview card.
const SEPOLIA_FALLBACK_RPC_URLS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://1rpc.io/sepolia',
] as const

export function createClient(env: Env) {
  const primary = env.SEPOLIA_RPC_URL || DEFAULT_SEPOLIA_RPC_URL
  const urls = [
    primary,
    ...SEPOLIA_FALLBACK_RPC_URLS.filter((url) => url !== primary),
  ]
  return createPublicClient({
    chain: sepoliaWithEns,
    // rank: false keeps the declared order (secret-configured primary first).
    transport: fallback(
      urls.map((url) => http(url, { retryCount: 2 })),
      { rank: false, retryCount: 2 },
    ),
    batch: { multicall: true },
  })
}

export type EnsClient = ReturnType<typeof createClient>
