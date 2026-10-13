import { isSepoliaBuild } from '@/config'

// Earliest block any v2 registry can hold a role event: the root registry's
// deployment, and it is the ancestor of every other registry. Confirmed with
// `eth_getCode` on Sepolia for the 2026-10-01 redeploy (contracts-v2
// `deployments/sepolia` @ 95de2ee0); the .eth registry follows at 11820399.
// Registries from earlier deployments hang off a root nothing resolves
// through any more, so their events are deliberately out of range.
// On mainnet this is the original root's deployment (0x51Bb…a750). The .eth
// registry (26105621) survived the partial redeploy, whose root (0x2553…A91e)
// only arrived at 26183742, so this still precedes every live registry.
export const MAINNET_ROLES_FROM_BLOCK = 26_105_295n
export const SEPOLIA_ROLES_FROM_BLOCK = 11_820_291n

export const ROLES_FROM_BLOCK = isSepoliaBuild
  ? SEPOLIA_ROLES_FROM_BLOCK
  : MAINNET_ROLES_FROM_BLOCK
