import { createEnsNodeClient } from 'enssdk/core'
import { omnigraph } from 'enssdk/omnigraph'

if (!import.meta.env.VITE_ENSNODE_URL)
  throw new Error(`Expected VITE_ENSNODE_URL to be defined.`)

export const ensNodeClient = createEnsNodeClient({
  url: import.meta.env.VITE_ENSNODE_URL,
}).extend(omnigraph)
