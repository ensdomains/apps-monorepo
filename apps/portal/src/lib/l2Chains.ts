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
import { isSepoliaBuild } from '@/config'

/**
 * The L2s whose reverse registrars take ENSv1 `setName`, on the build's
 * network: reverse resolution derives its coin types from that network, so the
 * clients must match it. Chosen at build time so a bundle carries one network's
 * chains, and free of wagmi so the worker's CSP can import it.
 */
export const L2_CHAINS = isSepoliaBuild
  ? ([
      optimismSepolia,
      arbitrumSepolia,
      baseSepolia,
      lineaSepolia,
      scrollSepolia,
    ] as const)
  : ([optimism, arbitrum, base, linea, scroll] as const)
