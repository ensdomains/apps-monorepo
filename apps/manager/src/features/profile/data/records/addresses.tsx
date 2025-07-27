import type { AddressRecord } from '../../types'

const chainIdToCoinType = (chainId: number) => (0x80000000 | chainId) >>> 0

export const addressRecords: AddressRecord[] = [
  {
    coinType: 60,
    name: 'Ethereum',
    notation: 'ETH',
  },
  {
    coinType: 0,
    name: 'Bitcoin',
    notation: 'BTC',
  },
  // Layer 2 Networks
  {
    coinType: chainIdToCoinType(10),
    name: 'Optimism',
    notation: 'OP',
  },
  {
    coinType: chainIdToCoinType(42161),
    name: 'Arbitrum One',
    notation: 'ARB',
  },
  {
    coinType: chainIdToCoinType(137),
    name: 'Polygon',
    notation: 'MATIC',
  },
  {
    coinType: chainIdToCoinType(8453),
    name: 'Base',
    notation: 'ETH',
  },
  {
    coinType: chainIdToCoinType(324),
    name: 'zkSync Era',
    notation: 'ETH',
  },
  {
    coinType: chainIdToCoinType(59144),
    name: 'Linea',
    notation: 'ETH',
  },
  {
    coinType: chainIdToCoinType(534352),
    name: 'Scroll',
    notation: 'ETH',
  },
  {
    coinType: chainIdToCoinType(5000),
    name: 'Mantle',
    notation: 'MNT',
  },
  {
    coinType: chainIdToCoinType(1101),
    name: 'Polygon zkEVM',
    notation: 'ETH',
  },
  // Other Popular Chains
  {
    coinType: chainIdToCoinType(56),
    name: 'BNB Smart Chain',
    notation: 'BNB',
  },
  {
    coinType: chainIdToCoinType(43114),
    name: 'Avalanche C-Chain',
    notation: 'AVAX',
  },
  {
    coinType: chainIdToCoinType(250),
    name: 'Fantom',
    notation: 'FTM',
  },
  {
    coinType: chainIdToCoinType(42220),
    name: 'Celo',
    notation: 'CELO',
  },
  {
    coinType: chainIdToCoinType(100),
    name: 'Gnosis Chain',
    notation: 'XDAI',
  },
] as const satisfies [AddressRecord, ...AddressRecord[]]
