import type { EnsNetwork } from '@ens-apps/config'
import { envConfig } from '@/config'

// Earliest block any v2 registry can hold a role event: the root registry's
// deployment, and it is the ancestor of every other registry. Confirmed with
// `eth_getCode` on Sepolia for the 2026-10-01 redeploy (contracts-v2
// `deployments/sepolia` @ 95de2ee0); the .eth registry follows at 11820399.
// Registries from earlier deployments hang off a root nothing resolves
// through any more, so their events are deliberately out of range.
// Mainnet's root registry (0x51Bb…a750) was measured the same way; its .eth
// registry follows at 26105621.
export const ROLES_FROM_BLOCK_BY_NETWORK = {
  mainnet: 26_105_295n,
  sepolia: 11_820_291n,
} as const satisfies Record<EnsNetwork, bigint>

export const ROLES_FROM_BLOCK = ROLES_FROM_BLOCK_BY_NETWORK[envConfig.network]
