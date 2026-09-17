import type { Address } from 'viem'
import { mainnet } from 'viem/chains'
import {
  getCommemorativeNftContractAddress,
  getCommemorativeNftTokenId,
} from './config'
import type { CommemorativeNftShareUrls } from './types'

const normalizedProfileName = (name: string) =>
  name.trim().replace(/\.$/, '').toLowerCase()

export const buildCommemorativeNftPublicUrl = (params: {
  readonly ownerAddress: Address
  readonly rendererOrigin: string
}): string => {
  const url = new URL('/nft/', params.rendererOrigin)
  url.searchParams.set(
    'tokenId',
    getCommemorativeNftTokenId(params.ownerAddress).toString(),
  )
  return url.toString()
}

export const isCommemorativeNftCanonicalProfile = (
  routeName: string,
  profileName: string,
): boolean =>
  normalizedProfileName(routeName) === normalizedProfileName(profileName)

export const buildCommemorativeNftShareUrls = (
  externalUrl: string | undefined,
  minted: boolean,
): CommemorativeNftShareUrls => {
  if (!externalUrl) return {}

  const text = minted
    ? 'I upgraded to ENSv2 and minted my commemorative NFT.'
    : 'I upgraded to ENSv2. Take a look at my commemorative NFT.'
  return {
    external: externalUrl,
    x: `https://x.com/intent/post?${new URLSearchParams({ text, url: externalUrl })}`,
    telegram: `https://t.me/share/url?${new URLSearchParams({ text, url: externalUrl })}`,
  }
}

export const buildCommemorativeNftMarketplaceUrl = (params: {
  readonly chainId: number
  readonly ownerAddress: Address
  readonly minted: boolean
}): string | undefined => {
  // OpenSea discontinued testnets: https://support.opensea.io/en/articles/11833955-farewell-testnets
  if (!params.minted || params.chainId !== mainnet.id) return undefined

  const contractAddress = getCommemorativeNftContractAddress(params.chainId)
  if (!contractAddress) return undefined

  const tokenId = getCommemorativeNftTokenId(params.ownerAddress).toString()
  return `https://opensea.io/assets/ethereum/${contractAddress}/${tokenId}`
}
