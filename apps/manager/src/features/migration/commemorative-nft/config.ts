import { type Address, getAddress, keccak256 } from 'viem'
import { sepolia } from 'viem/chains'
import type { CommemorativeNftAssets } from './types'

export const COMMEMORATIVE_NFT_SEPOLIA_ADDRESS = getAddress(
  '0xe49A9D706FCD82AA575496352B5633F80fBBC449',
)

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const optionalOrigin = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimTrailingSlash(trimmed) : undefined
}

export const getCommemorativeNftConfig = () => ({
  assetOrigin: optionalOrigin(
    import.meta.env.VITE_COMMEMORATIVE_NFT_ASSET_ORIGIN,
  ),
  eligibilityOrigin: optionalOrigin(
    import.meta.env.VITE_COMMEMORATIVE_NFT_ELIGIBILITY_ORIGIN,
  ),
})

export const getCommemorativeNftContractAddress = (
  chainId: number,
): Address | undefined =>
  chainId === sepolia.id ? COMMEMORATIVE_NFT_SEPOLIA_ADDRESS : undefined

export const getCommemorativeNftTokenId = (ownerAddress: Address): bigint =>
  BigInt(keccak256(ownerAddress))

export const buildCommemorativeNftEligibilityUrl = (
  eligibilityOrigin: string,
  ownerAddress: Address,
): string =>
  `${trimTrailingSlash(eligibilityOrigin)}/${ownerAddress.toLowerCase()}.json`

export const buildCommemorativeNftAssets = (
  assetOrigin: string | undefined,
  ownerAddress: Address,
): CommemorativeNftAssets => {
  if (!assetOrigin) return {}

  const tokenId = getCommemorativeNftTokenId(ownerAddress).toString()
  const origin = trimTrailingSlash(assetOrigin)

  return {
    metadataUrl: `${origin}/${tokenId}.json`,
    imageUrl: `${origin}/${tokenId}.png`,
    animationUrl: `${origin}/${tokenId}.mp4`,
  }
}
