import type { EndpointKey } from '@ens-apps/config'

/** The ENS services the manager reads; only these must exist on its network. */
export const MANAGER_ENDPOINTS = [
  'bignameApi',
] as const satisfies readonly EndpointKey[]
