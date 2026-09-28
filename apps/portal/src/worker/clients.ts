import { orderedRpcUrls } from '@ens-apps/config'
import { createPublicClient, fallback, http } from 'viem'
import { envConfig } from '@/config'

export function createClient(env: Env) {
  // Unlike the browser bundle, the worker resolves its primary at request time
  // from a Cloudflare secret. The network's shared public fallbacks sit behind
  // it, and are used alone when the secret is unset (e.g. `wrangler dev`
  // without a `.dev.vars`) — a failed OG/SSR read means a broken preview card.
  const urls = orderedRpcUrls(env.SEPOLIA_RPC_URL, envConfig.rpcFallbacks)
  return createPublicClient({
    chain: envConfig.chain,
    // rank: false keeps the declared order (secret-configured primary first).
    transport: fallback(
      urls.map((url) => http(url, { retryCount: 2 })),
      { rank: false, retryCount: 2 },
    ),
    batch: { multicall: true },
    // Any resolver can revert with OffchainLookup, and viem follows it with an
    // unguarded fetch and then an eth_call that may revert with another lookup,
    // unbounded. An offchain name just renders its card without records.
    ccipRead: false,
  })
}

export type EnsClient = ReturnType<typeof createClient>
