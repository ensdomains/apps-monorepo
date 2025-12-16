import { namechainSepolia, sepoliaWithEns } from '@/lib/wagmi'

// ensjs doesn't work well with multichain yet
export const namechainEthRegistryAddress =
  namechainSepolia.contracts.ensV2EthRegistry.address

export const sepoliaEthRegistryAddress =
  sepoliaWithEns.contracts.ensRegistry.address

export const l2RegistryFinderAddress =
  '0x55E9161e41D420f035010ADAaeDB663Ce9106D92'
