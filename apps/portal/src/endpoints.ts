import type { EndpointKey } from '@ens-apps/config'

/** The ENS services the portal reads; only these must exist on its network. */
export const PORTAL_ENDPOINTS = [
  'bignameApi',
] as const satisfies readonly EndpointKey[]
