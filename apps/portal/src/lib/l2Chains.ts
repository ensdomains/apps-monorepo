import type { EnsNetwork } from '@ens-apps/config'
import type { Chain } from 'viem'
import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  linea,
  lineaSepolia,
  optimism,
  optimismSepolia,
  scroll,
  scrollSepolia,
} from 'viem/chains'
import { envConfig } from '@/config'

/**
 * The L2s whose reverse registrars take ENSv1 `setName`, on the build's
 * network: reverse resolution derives its coin types from that network, so the
 * clients must match it. Free of wagmi so the worker's CSP can import it.
 */
const L2_CHAINS_BY_NETWORK = {
  mainnet: [optimism, arbitrum, base, linea, scroll],
  sepolia: [
    optimismSepolia,
    arbitrumSepolia,
    baseSepolia,
    lineaSepolia,
    scrollSepolia,
  ],
} as const satisfies Record<EnsNetwork, readonly Chain[]>

export const L2_CHAINS = L2_CHAINS_BY_NETWORK[envConfig.network]
