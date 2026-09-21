import { buildConfig, type EnsNetwork } from '@ens-apps/config'
import { createIsomorphicFn } from '@tanstack/react-start'

/**
 * The manager's composition root for configuration: the only module in the
 * app that reads `import.meta.env`. Everything downstream takes values from
 * the returned config, so there is exactly one place to look when asking what
 * network a build targets.
 *
 * Resolution fails loudly. A build with no `VITE_ENS_NETWORK`, or one whose
 * network has no ENSv2 deployment, throws here rather than falling back to a
 * network, because a wrong-network fallback produces valid calldata against
 * the wrong contracts.
 */

/**
 * The manager's own RPC endpoint per network.
 *
 * Not a secret: the path key ships in every browser bundle and identifies a
 * quota bucket, nothing more. It is kept per app so usage is attributed to the
 * manager rather than pooled with the portal, and per network so a mainnet
 * build cannot inherit a Sepolia endpoint. A network with no entry falls back
 * to the shared public endpoints in the network profile.
 */
const MANAGER_RPC_URLS: Partial<Record<EnsNetwork, string>> = {
  sepolia:
    'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aTDnH6wviUR8JD3QmlfqV1j',
}

const network = import.meta.env?.VITE_ENS_NETWORK

// Relative URLs (like `/rpc`, used by the e2e stack) only resolve in the
// browser, so SSR reads the server-specific override instead.
const resolveRpcOverride = createIsomorphicFn()
  .client(() => import.meta.env?.VITE_SEPOLIA_RPC_URL)
  .server(() => {
    const envUrl = import.meta.env?.VITE_SEPOLIA_RPC_URL
    if (envUrl?.startsWith('/')) {
      return import.meta.env?.VITE_SEPOLIA_RPC_URL_SERVER
    }
    return envUrl
  })

export const config = buildConfig({
  network,
  // `createIsomorphicFn` is a no-op stub until the TanStack Start Vite plugin
  // transforms it, so it returns `undefined` where that transform does not run
  // (the vitest config, which omits the Start plugin).
  rpcUrl: resolveRpcOverride() ?? MANAGER_RPC_URLS[network as EnsNetwork],
  overrides: {
    indexerGraphql: import.meta.env?.VITE_INDEXER_GRAPHQL_URL,
  },
})

export const { chain, isTestnet, rpcUrls } = config
