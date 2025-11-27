import type { Address } from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'

// ensjs doesn't work well with multichain yet
export const namechainEthRegistryAddress = sepoliaWithEns.contracts
  .ensL2Registry.address as Address

export const sepoliaEthRegistryAddress = sepoliaWithEns.contracts.ensRegistry
  .address as Address

export const l2RegistryFinderAddress =
  '0x1d4a4326C8a51aaD8C286b553EfA855C35890B26' as Address
