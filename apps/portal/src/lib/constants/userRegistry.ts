import type { Address } from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'

export const namechainUserRegistryAddress = sepoliaWithEns.contracts
  .ensL2UserRegistry.address as Address

export const sepoliaUserRegistryAddress = sepoliaWithEns.contracts
  .ensUserRegistry.address as Address
