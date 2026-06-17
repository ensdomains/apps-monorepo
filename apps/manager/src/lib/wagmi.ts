import {
  customSepolia,
  SEPOLIA_RPC_URL,
  sepoliaWithEns,
  WALLETCONNECT_PROJECT_ID,
} from '@ens-apps/indexer/chain'
import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createPublicClient, http } from 'viem'
import { type CreateConnectorFn, createConfig } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'
import { privyConnector } from './privy/privy-connector'

// Re-export shared chain config so existing imports from `@/lib/wagmi` keep
// working. New code should prefer importing from `@ens-apps/indexer/chain`.
export {
  customSepolia,
  SEPOLIA_RPC_URL,
  sepoliaWithEns,
  WALLETCONNECT_PROJECT_ID,
}

export const publicClient = createPublicClient({
  chain: sepoliaWithEns,
  transport: http(SEPOLIA_RPC_URL),
  batch: {
    multicall: true,
  },
})

// Build-time vendor selection (mirrors USE_PRIVY in feature-flags.ts). Read
// import.meta.env directly so Vite folds it to a constant and tree-shakes the
// unused vendor's connectors out of the bundle. Connectors are always surfaced
// through OUR config — never @privy-io/wagmi (Constraint #1, audit:wagmi-providers).
//   - Privy: privyConnector() (embedded wallet, installed by the bridge after a
//     session resolves) + walletConnect() QR pairing. EIP-6963 discovery
//     (multiInjectedProviderDiscovery) surfaces injected wallets too.
//   - RainbowKit (default): injected + MetaMask + WalletConnect via RainbowKit's
//     own connectors. EOA wallets only; no Privy.
const usePrivy = import.meta.env.VITE_FF_USE_PRIVY === 'true'

const connectors: CreateConnectorFn[] = usePrivy
  ? [privyConnector(), walletConnect({ projectId: WALLETCONNECT_PROJECT_ID })]
  : connectorsForWallets(
      [
        {
          groupName: 'Popular',
          wallets: [injectedWallet, metaMaskWallet, walletConnectWallet],
        },
      ],
      { appName: 'ENS Manager', projectId: WALLETCONNECT_PROJECT_ID },
    )

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: true,
  multiInjectedProviderDiscovery: true,
  chains: [sepoliaWithEns],
  transports: {
    [sepoliaWithEns.id]: http(SEPOLIA_RPC_URL, { batch: { batchSize: 30 } }),
  },
  connectors,
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
