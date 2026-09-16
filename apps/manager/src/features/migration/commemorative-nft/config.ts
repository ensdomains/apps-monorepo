import { type Address, getAddress, keccak256 } from 'viem'
import { sepolia } from 'viem/chains'
import type {
  CommemorativeNftAssets,
  CommemorativeNftEligibility,
} from './types'

export const COMMEMORATIVE_NFT_SEPOLIA_ADDRESS = getAddress(
  '0x8B63f2f78B56058b8b4A9cb34482535827e94084',
)

export const DEFAULT_COMMEMORATIVE_NFT_RENDERER_ORIGIN = 'https://nft.ens.dev'
export const DEFAULT_COMMEMORATIVE_NFT_ASSET_ORIGIN =
  'https://nft-assets.ens.dev'

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const optionalOrigin = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimTrailingSlash(trimmed) : undefined
}

export const getCommemorativeNftConfig = () => ({
  assetOrigin:
    optionalOrigin(import.meta.env.VITE_COMMEMORATIVE_NFT_ASSET_ORIGIN) ??
    DEFAULT_COMMEMORATIVE_NFT_ASSET_ORIGIN,
  rendererOrigin:
    optionalOrigin(import.meta.env.VITE_COMMEMORATIVE_NFT_RENDERER_ORIGIN) ??
    DEFAULT_COMMEMORATIVE_NFT_RENDERER_ORIGIN,
})

export const getCommemorativeNftContractAddress = (
  chainId: number,
): Address | undefined =>
  chainId === sepolia.id ? COMMEMORATIVE_NFT_SEPOLIA_ADDRESS : undefined

export const getCommemorativeNftTokenId = (ownerAddress: Address): bigint =>
  BigInt(keccak256(ownerAddress))

export const buildCommemorativeNftAssets = (
  assetOrigin: string | undefined,
  ownerAddress: Address,
): CommemorativeNftAssets => {
  if (!assetOrigin) return {}

  const tokenId = getCommemorativeNftTokenId(ownerAddress).toString()
  const origin = trimTrailingSlash(assetOrigin)

  return {
    metadataUrl: new URL(`${origin}/token/${tokenId}.json`).toString(),
    imageUrl: new URL(`${origin}/token/${tokenId}/image.webp`).toString(),
  }
}

export const buildCommemorativeNftRendererUrl = (params: {
  readonly eligibility: CommemorativeNftEligibility
  readonly rendererOrigin: string
}): string | undefined => {
  if (!params.eligibility.assets.metadataUrl) return undefined

  const rendererUrl = new URL(trimTrailingSlash(params.rendererOrigin))
  rendererUrl.searchParams.delete('tokenURI')
  rendererUrl.searchParams.set(
    'tokenId',
    getCommemorativeNftTokenId(params.eligibility.ownerAddress).toString(),
  )
  rendererUrl.searchParams.set('transparent', '1')
  return rendererUrl.toString()
}
