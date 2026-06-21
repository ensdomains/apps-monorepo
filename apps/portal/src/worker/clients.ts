import { sepoliaWithEns } from '@ens-apps/indexer/chain'
import { createPublicClient, http } from 'viem'

// Public, keyless Sepolia endpoint used as a local-dev / fallback transport
// when the SEPOLIA_RPC_URL secret is not configured (e.g. `wrangler dev`
// without a `.dev.vars`). Production sets SEPOLIA_RPC_URL as a Worker secret.
const FALLBACK_SEPOLIA_RPC_URL = 'https://sepolia.drpc.org'

export function createClient(env: Env) {
  return createPublicClient({
    chain: sepoliaWithEns,
    transport: http(env.SEPOLIA_RPC_URL || FALLBACK_SEPOLIA_RPC_URL),
  })
}

export type EnsClient = ReturnType<typeof createClient>
