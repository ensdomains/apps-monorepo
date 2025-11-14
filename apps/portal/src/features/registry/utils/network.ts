import { mainnet, sepolia } from 'viem/chains'

export type NetworkLocation = 'L1' | 'L2' | 'unknown'
export type NetworkMeta = {
  name: string
  location: NetworkLocation
}

export function getNetworkMetaFromChainId(
  chainId?: number | null,
): NetworkMeta {
  switch (chainId) {
    case sepolia.id:
      return {
        name: 'Namechain',
        location: 'L2',
      }
    case mainnet.id:
      return {
        name: 'Mainnet',
        location: 'L1',
      }
    default:
      return {
        name: 'Unknown',
        location: 'unknown',
      }
  }
}
