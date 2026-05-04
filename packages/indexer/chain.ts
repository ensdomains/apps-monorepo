import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { sepolia } from 'viem/chains'

/**
 * Single source of truth for chain / RPC / wallet config used across the apps.
 *
 * The Tenderly virtual sepolia fork advertises the real sepolia chain id
 * (11155111), so wallets see it as standard sepolia and just need to use the
 * fork RPC URL below.
 *
 * The v1 ENS subgraph URL for the Tenderly fork is provided by `@ensdomains/ensjs`
 * via `extendChainWithEns`, so it is not duplicated here.
 */

export const SEPOLIA_RPC_URL =
  'https://virtual.sepolia.us-east.rpc.tenderly.co/5861d235-a772-47a3-8772-4f6a3f2ea4b5'

export const WALLETCONNECT_PROJECT_ID = '1cb2e088d817de31a39a54154b265f68'

export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [SEPOLIA_RPC_URL] },
    public: { http: [SEPOLIA_RPC_URL] },
  },
}

export const sepoliaWithEns = extendChainWithEns(customSepolia)
