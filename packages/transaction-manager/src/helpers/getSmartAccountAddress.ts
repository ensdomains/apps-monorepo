import type { Address } from 'viem'
import type { Signer } from '../types/signer.types'

export function getSmartAccountAddress(signer: Signer): Address {
  if (signer.type === 'rhinestone') {
    return signer.account.getAddress() as Address
  }
  throw new Error('Only Rhinestone signer is supported for this operation')
}
