import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import {
  getCommemorativeNftContractAddress,
  getCommemorativeNftTokenId,
} from './config'
import type { CommemorativeNftShareUrls } from './types'

const normalizedProfileName = (name: string) =>
  name.trim().replace(/\.$/, '').toLowerCase()

export const buildCommemorativeNftProfileUrl = (profileName: string): string =>
  `https://app.ens.domains/p/${encodeURIComponent(
    normalizedProfileName(profileName),
  )}`

export const isCommemorativeNftCanonicalProfile = (
  routeName: string,
  profileName: string,
): boolean =>
  normalizedProfileName(routeName) === normalizedProfileName(profileName)

export const buildCommemorativeNftShareUrls = (
  externalUrl: string | undefined,
): CommemorativeNftShareUrls => {
  if (!externalUrl) return {}

  const text = 'I upgraded to ENSv2 and minted my commemorative NFT.'
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
  if (!params.minted || params.chainId !== sepolia.id) return undefined

  const contractAddress = getCommemorativeNftContractAddress(params.chainId)
  if (!contractAddress) return undefined

  const tokenId = getCommemorativeNftTokenId(params.ownerAddress).toString()
  return `https://testnets.opensea.io/assets/sepolia/${contractAddress}/${tokenId}`
}
