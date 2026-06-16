import { WALLETCONNECT_PROJECT_ID } from '@ens-apps/indexer/chain'
import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  frameWallet,
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createIsomorphicFn } from '@tanstack/react-start'
import { createPublicClient, fallback, http } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import { createConfig } from 'wagmi'

export { WALLETCONNECT_PROJECT_ID }

// Manager owns its Sepolia RPC URL — it must NOT reuse the RPC URL exported by
// `@ens-apps/indexer/chain`, so each app's DRPC key is attributed separately.
// This key is shipped in the browser bundle and is therefore not secret; it
// only scopes quota/usage to the manager app. An optional build-time override
// (`VITE_SEPOLIA_RPC_URL`) takes precedence when provided.
const MANAGER_SEPOLIA_RPC_URL =
  'https://lb.drpc.live/sepolia/AnmpasF2C0JBqeAEzxVO8aTDnH6wviUR8JD3QmlfqV1j'

const resolveRpcUrl = createIsomorphicFn()
  .client(() => {
    // In the browser any configured URL works, including relative paths like
    // `/rpc` that proxy through the app's own origin.
    return import.meta.env?.VITE_SEPOLIA_RPC_URL || MANAGER_SEPOLIA_RPC_URL
  })
  .server(() => {
    const envUrl = import.meta.env?.VITE_SEPOLIA_RPC_URL
    if (!envUrl) return MANAGER_SEPOLIA_RPC_URL
    // Relative paths (like /rpc) only work in the browser. During SSR use the
    // server-specific URL or fall back to the manager default.
    if (envUrl.startsWith('/')) {
      return (
        import.meta.env?.VITE_SEPOLIA_RPC_URL_SERVER || MANAGER_SEPOLIA_RPC_URL
      )
    }
    return envUrl
  })

// `createIsomorphicFn` is a no-op stub until the TanStack Start Vite plugin
// transforms it. In environments where that transform doesn't run (e.g. the
// vitest config, which doesn't include the Start plugin) the call returns
// `undefined`, so fall back to the default to keep `SEPOLIA_RPC_URL` a string.
export const SEPOLIA_RPC_URL: string =
  resolveRpcUrl() || MANAGER_SEPOLIA_RPC_URL

// Public Sepolia fallback endpoints. dRPC intermittently returns HTTP 500s on
// otherwise-valid `eth_call`s (e.g. `nonces`, `MIN_COMMITMENT_AGE`); viem's
// `fallback()` transport transparently fails over so a single provider blip
// doesn't break a registration. The manager's own RPC URL stays the preferred
// (primary) endpoint so quota/usage is still attributed to the manager app.
const SEPOLIA_FALLBACK_RPC_URLS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://1rpc.io/sepolia',
] as const

const SEPOLIA_RPC_URLS: readonly string[] = [
  SEPOLIA_RPC_URL,
  ...SEPOLIA_FALLBACK_RPC_URLS.filter((url) => url !== SEPOLIA_RPC_URL),
]

export const sepoliaFallbackTransport = fallback(
  SEPOLIA_RPC_URLS.map((url) => http(url, { retryCount: 2 })),
  { rank: false, retryCount: 2 },
)

export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [...SEPOLIA_RPC_URLS] },
    public: { http: [...SEPOLIA_RPC_URLS] },
  },
}

export const sepoliaWithEns = extendChainWithEns(customSepolia)

export const publicClient = createPublicClient({
  chain: sepoliaWithEns,
  transport: sepoliaFallbackTransport,
  batch: {
    multicall: true,
  },
})

// Base Sepolia (L2) source chain for cross-chain stable payments. Not part of
// the wagmi connection set — used read-only to display the user's L2 stable
// balance in the payment picker. The actual bridge/settlement is handled by
// the Rhinestone orchestrator, not wagmi. RPC overridable via env; defaults to
// the public Base Sepolia endpoint.
export const BASE_SEPOLIA_RPC_URL: string =
  import.meta.env?.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'

export const baseSepoliaPublicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(BASE_SEPOLIA_RPC_URL),
  batch: {
    multicall: true,
  },
})

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: true,
  multiInjectedProviderDiscovery: true,
  chains: [sepoliaWithEns],
  transports: {
    [sepoliaWithEns.id]: sepoliaFallbackTransport,
  },
  connectors: connectorsForWallets(
    [
      {
        groupName: 'Popular',
        wallets: [
          injectedWallet,
          metaMaskWallet,
          walletConnectWallet,
          frameWallet,
        ],
      },
    ],
    { projectId: WALLETCONNECT_PROJECT_ID, appName: 'ENS Manager' },
  ),
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
