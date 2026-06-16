import { sepoliaWithEns } from '@ens-apps/indexer/chain'
import { createPublicClient, http } from 'viem'

export function createClient(env: Env) {
  return createPublicClient({
    chain: sepoliaWithEns,
    transport: http(env.SEPOLIA_RPC_URL),
  })
}

export type EnsClient = ReturnType<typeof createClient>
