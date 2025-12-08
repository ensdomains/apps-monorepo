import { namechainSepolia, sepoliaWithEns } from '@/lib/wagmi'

// ensjs doesn't work well with multichain yet
export const namechainEthRegistryAddress =
  namechainSepolia.contracts.ensV2EthRegistry.address

export const sepoliaEthRegistryAddress =
  sepoliaWithEns.contracts.ensRegistry.address

export const l2RegistryFinderAddress =
  '0x1d4a4326C8a51aaD8C286b553EfA855C35890B26'
