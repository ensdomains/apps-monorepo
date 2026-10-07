import type { EnsNetwork } from '@ens-apps/config'
import { type Address, getAddress, keccak256 } from 'viem'
import { envConfig } from '@/config'
import type {
  CommemorativeNftAssets,
  CommemorativeNftEligibility,
} from './types'

const COMMEMORATIVE_NFT_ADDRESSES: Record<EnsNetwork, Address | null> = {
  // No mainnet CommemorativeNFT deployment exists yet.
  mainnet: null,
  sepolia: getAddress('0xa55605c6242CbFc27117b63466B423fbc092a2A9'),
}

const DEFAULT_COMMEMORATIVE_NFT_RENDERER_ORIGIN = 'https://v2.nft.ens.domains'
const DEFAULT_COMMEMORATIVE_NFT_ASSET_ORIGIN =
  'https://v2.nft-assets.ens.domains'

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const parseOrigin = (
  value: string,
  canUseLocalHttp: boolean,
): string | undefined => {
  if (!URL.canParse(value)) return undefined
  const url = new URL(value)
  const isLocalHttp =
    canUseLocalHttp &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !isLocalHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/*$/.test(url.pathname)
  )
    return undefined
  return url.origin
}

type NftConfig = {
  readonly assetOrigin: string
  readonly rendererOrigin: string
  readonly isValid: boolean
}
let cachedConfig:
  | { readonly key: string; readonly value: NftConfig }
  | undefined

export const getCommemorativeNftConfig = (): NftConfig => {
  const assetValue =
    import.meta.env.VITE_COMMEMORATIVE_NFT_ASSET_ORIGIN?.trim() ||
    DEFAULT_COMMEMORATIVE_NFT_ASSET_ORIGIN
  const rendererValue =
    import.meta.env.VITE_COMMEMORATIVE_NFT_RENDERER_ORIGIN?.trim() ||
    DEFAULT_COMMEMORATIVE_NFT_RENDERER_ORIGIN
  const key = JSON.stringify([assetValue, rendererValue, import.meta.env.DEV])
  if (cachedConfig?.key === key) return cachedConfig.value
  const assetOrigin = parseOrigin(assetValue, import.meta.env.DEV === true)
  const rendererOrigin = parseOrigin(
    rendererValue,
    import.meta.env.DEV === true,
  )
  const value = {
    assetOrigin: assetOrigin ?? DEFAULT_COMMEMORATIVE_NFT_ASSET_ORIGIN,
    rendererOrigin: rendererOrigin ?? DEFAULT_COMMEMORATIVE_NFT_RENDERER_ORIGIN,
    isValid: !!assetOrigin && !!rendererOrigin,
  }
  cachedConfig = { key, value }
  return value
}

export const getCommemorativeNftContractAddress = (): Address | undefined =>
  COMMEMORATIVE_NFT_ADDRESSES[envConfig.network] ?? undefined

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
