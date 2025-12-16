import { namechainSepolia, sepoliaWithEns } from '@/lib/wagmi'

export const sepoliaVerifiableFactory =
  sepoliaWithEns.contracts.ensVerifiableFactory.address

export const namechainVerifiableFactory =
  namechainSepolia.contracts.ensVerifiableFactory.address
