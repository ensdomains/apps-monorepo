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
    ? 'Upgraded to ENSv2 and minted my card.'
    : 'Upgraded to ENSv2. Preview my card.'
  return {
    external: externalUrl,
    message: `${text}\n${externalUrl}`,
    x: `https://x.com/intent/post?${new URLSearchParams({ text, url: externalUrl })}`,
    telegram: `https://t.me/share/url?${new URLSearchParams({ text, url: externalUrl })}`,
  }
}

export const buildCommemorativeNftMarketplaceUrl = (params: {
  readonly chainId: number
  readonly ownerAddress: Address
  readonly minted: boolean
}): string | undefined => {
  // OpenSea no longer indexes testnets.
  if (!params.minted || params.chainId !== mainnet.id) return undefined

  const contractAddress = getCommemorativeNftContractAddress(params.chainId)
  if (!contractAddress) return undefined

  const tokenId = getCommemorativeNftTokenId(params.ownerAddress).toString()
  return `https://opensea.io/assets/ethereum/${contractAddress}/${tokenId}`
}
