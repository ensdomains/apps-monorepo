import { mainnet, sepolia } from 'viem/chains'

export type NetworkLocation = 'L1' | 'L2' | 'unknown'
export type NetworkMeta = {
  name: string
  location: NetworkLocation
  chainId: number
}

export function getNetworkMetaFromChainId(
  chainId?: number | null,
): NetworkMeta {
  switch (chainId) {
    case sepolia.id:
      return {
        name: 'Namechain',
        location: 'L2',
        chainId: sepolia.id,
      }
    case mainnet.id:
      return {
        name: 'Mainnet',
        location: 'L1',
        chainId: sepolia.id,
      }
    default:
      return {
        name: 'Unknown',
        location: 'unknown',
        chainId: sepolia.id,
      }
  }
}
