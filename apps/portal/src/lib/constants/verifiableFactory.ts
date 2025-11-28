import type { Address } from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'

export const sepoliaVerifiableFactory = sepoliaWithEns.contracts
  .ensVerifiableFactory.address as Address

export const namechainVerifiableFactory = sepoliaWithEns.contracts
  .ensL2VerifiableFactory.address as Address
