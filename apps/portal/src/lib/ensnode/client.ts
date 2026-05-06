import { createEnsNodeClient } from 'enssdk/core'
import { omnigraph } from 'enssdk/omnigraph'

export const ENSNODE_URL =
  import.meta.env.VITE_ENSNODE_URL ?? 'https://api.v2-sepolia.ensnode.io'

export const ensNodeClient = createEnsNodeClient({ url: ENSNODE_URL }).extend(
  omnigraph,
)
