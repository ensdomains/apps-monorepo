import { buildConfig } from '@ens-apps/config'

/**
 * The portal's composition root for configuration: the only browser-side
 * module that reads `import.meta.env`. Everything downstream takes values from
 * the returned config, so there is exactly one place to look when asking what
 * network a build targets.
 *
 * Resolution fails loudly. A build with no `VITE_ENS_NETWORK`, or one whose
 * network has no ENSv2 deployment, throws here rather than falling back to a
 * network, because a wrong-network fallback produces valid calldata against
 * the wrong contracts.
 *
 * The SSR/OG worker does not import this module. It reads its RPC URL from a
 * Cloudflare secret at request time and builds its own client; see
 * `worker/clients.ts`.
 */

// Portal owns its Sepolia RPC URL so each app's dRPC key is attributed
// separately. The key ships in the browser bundle and is not secret; it only
// scopes quota to the portal app. There is no attributed mainnet endpoint yet,
// so a mainnet build rides the network's shared public fallbacks.
const PORTAL_SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aRo7Ju0xlER8JS4QmlfqV1j'

const network = import.meta.env?.VITE_ENS_NETWORK

export const config = buildConfig({
  network,
  rpcUrl:
    import.meta.env?.VITE_SEPOLIA_RPC_URL ??
    (network === 'sepolia' ? PORTAL_SEPOLIA_RPC_URL : undefined),
  overrides: {
    indexerGraphql: import.meta.env?.VITE_INDEXER_GRAPHQL_URL,
  },
})

export const { chain, isTestnet, rpcUrls } = config
