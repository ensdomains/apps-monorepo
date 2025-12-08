import type { Address } from 'viem'
import { namechainSepolia, sepoliaWithEns } from '@/lib/wagmi'

export const sepoliaVerifiableFactory = sepoliaWithEns.contracts
  .ensVerifiableFactory.address as Address

export const namechainVerifiableFactory = namechainSepolia.contracts
  .ensVerifiableFactory.address as Address
