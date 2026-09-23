import {
  ensL1Contracts,
  type SupportedL1ChainId,
  supportedL1Chains,
} from '@ensdomains/ensjs/chain'
import { type Address, isAddressEqual } from 'viem'

/**
 * Resolvers the migration flow knows how to read records from, per network.
 *
 * Deliberately not a union across networks. A name can point its resolver at
 * any address, including one that only has code on another chain, so a shared
 * list would classify such a name as a standard PublicResolver and produce a
 * migration plan against an address that is not a resolver here.
 */
const KNOWN_PUBLIC_RESOLVERS: Record<SupportedL1ChainId, readonly Address[]> = {
  [supportedL1Chains.mainnet]: [
    ensL1Contracts[supportedL1Chains.mainnet].ensPublicResolver.address,
    // An earlier mainnet PublicResolver. Verified by code: this address has
    // bytecode on mainnet and none on Sepolia.
    '0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41',
  ],
  [supportedL1Chains.sepolia]: [
    ensL1Contracts[supportedL1Chains.sepolia].ensPublicResolver.address,
    // Legacy Sepolia V1 PublicResolvers used by migration fixtures.
    '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
    '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
    '0x640294a2b2d87e7f522db3e3e3e876764bce170d',
    '0xc30ba2bd21583605d815826c3807e8224e398e10',
    '0x1da022710dF5002339274AaDEe8D58218e9D6AB5',
    '0xDaaF96c344f63131acadD0Ea35170E7892d3dfBA',
    '0xF29100983E058B709F3D539b0c765937B804AC15',
  ],
}

export const isKnownPublicResolver = (
  address: string | null,
  chainId: SupportedL1ChainId,
): boolean => {
  if (!address) return false
  return KNOWN_PUBLIC_RESOLVERS[chainId].some((known) =>
    isAddressEqual(known, address as Address),
  )
}
