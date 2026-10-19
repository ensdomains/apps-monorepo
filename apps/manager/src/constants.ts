import type { EnsNetwork } from '@ens-apps/config'
import { envConfig } from '@/config'

// No mainnet explorer is deployed yet, so mainnet links to none.
const EXPLORER_URLS: Readonly<Record<EnsNetwork, string | null>> = {
  mainnet: null,
  sepolia: 'https://sepolia.explorer.ens.domains',
}

/** Origin of the ENS Explorer (portal) app, linked to from the manager. */
export const EXPLORER_URL = EXPLORER_URLS[envConfig.network]
