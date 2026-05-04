import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { sepolia } from 'viem/chains'

/**
 * Single source of truth for chain / RPC / wallet config used across the apps.
 *
 * The Tenderly virtual sepolia fork advertises its own chain id, distinct from
 * real sepolia (11155111). Using a unique id forces wallets (MetaMask etc.) to
 * treat the fork as a custom network and route writes through our RPC instead
 * of submitting them to public sepolia.
 *
 * The v1 ENS subgraph URL for the Tenderly fork is provided by `@ensdomains/ensjs`
 * via `extendChainWithEns`, so it is not duplicated here.
 */

export const SEPOLIA_RPC_URL =
  'https://virtual.sepolia.us-east.rpc.tenderly.co/881ddb0f-475d-45ac-b93d-e1aca2841811'

export const TENDERLY_FORK_CHAIN_ID = 99911155111

export const WALLETCONNECT_PROJECT_ID = '1cb2e088d817de31a39a54154b265f68'

export const customSepolia = {
  ...sepolia,
  name: 'Tenderly Sepolia Fork',
  rpcUrls: {
    default: { http: [SEPOLIA_RPC_URL] },
    public: { http: [SEPOLIA_RPC_URL] },
  },
}

// extendChainWithEns refuses any chain id outside its supported list, so we
// extend against the original sepolia id and then override the id afterwards.
const sepoliaWithEnsBase = extendChainWithEns(customSepolia)

export const sepoliaWithEns = {
  ...sepoliaWithEnsBase,
  id: TENDERLY_FORK_CHAIN_ID,
} as unknown as typeof sepoliaWithEnsBase
