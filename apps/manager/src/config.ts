import { buildConfig } from '@ens-apps/config'
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

// Manager owns its Sepolia RPC URL so each app's dRPC key is attributed
// separately. The key ships in the browser bundle and is not secret; it only
// scopes quota to the manager app. There is no attributed mainnet endpoint
// yet, so a mainnet build rides the network's shared public fallbacks.
const MANAGER_SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aTDnH6wviUR8JD3QmlfqV1j'

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
  rpcUrl:
    resolveRpcOverride() ??
    (network === 'sepolia' ? MANAGER_SEPOLIA_RPC_URL : undefined),
  overrides: {
    indexerGraphql: import.meta.env?.VITE_INDEXER_GRAPHQL_URL,
  },
})

export const { chain, isTestnet, rpcUrls } = config
