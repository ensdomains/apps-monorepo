import type { EnsNetwork } from '@ens-apps/config'
import { envConfig } from '@/config'

// A network without a deployed explorer maps to null, so it links to none.
const EXPLORER_URLS: Readonly<Record<EnsNetwork, string | null>> = {
  mainnet: 'https://explorer.ens.domains',
  sepolia: 'https://sepolia.explorer.ens.domains',
}

/** Origin of the ENS Explorer (portal) app, linked to from the manager. */
export const EXPLORER_URL = EXPLORER_URLS[envConfig.network]
