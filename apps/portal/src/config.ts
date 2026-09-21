import { buildConfig, type EnsNetwork } from '@ens-apps/config'

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

/**
 * The portal's own RPC endpoint per network.
 *
 * Not a secret: the path key ships in every browser bundle and identifies a
 * quota bucket, nothing more. It is kept per app so usage is attributed to the
 * portal rather than pooled with the manager, and per network so a mainnet
 * build cannot inherit a Sepolia endpoint. A network with no entry falls back
 * to the shared public endpoints in the network profile.
 */
const PORTAL_RPC_URLS: Partial<Record<EnsNetwork, string>> = {
  sepolia:
    'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aRo7Ju0xlER8JS4QmlfqV1j',
}

const network = import.meta.env?.VITE_ENS_NETWORK

export const config = buildConfig({
  network,
  rpcUrl:
    import.meta.env?.VITE_SEPOLIA_RPC_URL ??
    PORTAL_RPC_URLS[network as EnsNetwork],
  overrides: {
    indexerGraphql: import.meta.env?.VITE_INDEXER_GRAPHQL_URL,
  },
})

export const { chain, isTestnet, rpcUrls } = config
