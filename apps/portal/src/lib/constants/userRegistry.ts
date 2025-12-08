import type { Address } from 'viem'
import { namechainSepolia, sepoliaWithEns } from '@/lib/wagmi'

export const namechainUserRegistryAddress = namechainSepolia.contracts
  .ensUserRegistry.address as Address

export const sepoliaUserRegistryAddress = sepoliaWithEns.contracts
  .ensUserRegistry.address as Address
