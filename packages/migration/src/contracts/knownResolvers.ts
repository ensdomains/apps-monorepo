import {
  type SupportedL1ChainId,
  supportedL1Chains,
} from '@ensdomains/ensjs/chain'
import { type Address, isAddressEqual } from 'viem'

const LEGACY_CONTENT_RESOLVERS = [
  '0x5FfC014343cd971B7eb70732021E26C35B744cc4',
  '0x1da022710dF5002339274AaDEe8D58218e9D6AB5',
] as const

// Verified, immutable resolvers whose entire profile is addr(node) and
// name(node). Read both directly; they need no indexed key inventory.
const ADDRESS_ONLY_RESOLVERS = [
  '0xda1756bb923af5d1a05e277cb1e54f1d0a127890', // Argent ENSResolver
  '0xf58d55f06bb92f083e78bb5063a2dd3544f9b6a3', // Loopring BaseENSResolver
] as const

export const isAddressOnlyResolver = (
  address: string | null,
  chainId: number | undefined,
): boolean =>
  !!address &&
  chainId === supportedL1Chains.mainnet &&
  ADDRESS_ONLY_RESOLVERS.some((known) =>
    isAddressEqual(known, address as Address),
  )

/**
 * ENS public resolver deployments, including the historical generations in
 * ens-app-v3/src/constants/resolverAddressData.ts and our Sepolia fixtures.
 *
 * Deliberately not a union across networks. A name can point its resolver at
 * any address, including one that only has code on another chain, so a shared
 * list would classify such a name as a standard PublicResolver and produce a
 * migration plan against an address that is not a resolver here.
 */
const KNOWN_PUBLIC_RESOLVERS: Record<SupportedL1ChainId, readonly Address[]> = {
  [supportedL1Chains.mainnet]: [
    '0xF29100983E058B709F3D539b0c765937B804AC15',
    '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63',
    '0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41',
    '0xDaaF96c344f63131acadD0Ea35170E7892d3dfBA',
    '0x226159d592E2b063810a10Ebf6dcbADA94Ed68b8',
    ...LEGACY_CONTENT_RESOLVERS,
  ],
  [supportedL1Chains.sepolia]: [
    '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
    '0x8948458626811dd0c23EB25Cc74291247077cC51',
    '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
    '0x0CeEC524b2807841739D3B5E161F5bf1430FFA48',
    // E2E's alternate Sepolia deployment; its registry is 0x7e89b563...
    // See e2e/fixtures/makeV1Name.ts, not the canonical V1 registry.
    '0x640294a2b2d87e7f522db3e3e3e876764bce170d',
    '0xc30ba2bd21583605d815826c3807e8224e398e10',
  ],
}

/** These generations predate typed contenthash records and store raw content. */
export const isLegacyContentPublicResolver = (
  address: Address,
  chainId: number | undefined,
): boolean =>
  chainId === supportedL1Chains.mainnet &&
  LEGACY_CONTENT_RESOLVERS.some((known) => isAddressEqual(known, address))

export const isKnownPublicResolver = (
  address: string | null,
  chainId: SupportedL1ChainId,
): boolean => {
  if (!address) return false
  return KNOWN_PUBLIC_RESOLVERS[chainId].some((known) =>
    isAddressEqual(known, address as Address),
  )
}

/** Copy support does not certify a resolver for locked-name migration. */
export const isSupportedRecordResolver = (
  address: string | null,
  chainId: SupportedL1ChainId,
): boolean =>
  isKnownPublicResolver(address, chainId) ||
  isAddressOnlyResolver(address, chainId)
