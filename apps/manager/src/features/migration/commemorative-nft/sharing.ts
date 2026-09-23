import type { Address } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import {
  getCommemorativeNftContractAddress,
  getCommemorativeNftTokenId,
} from './config'
import type { CommemorativeNftShareUrls, RendererTraits } from './types'

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

const getShareTraitLine = (traits: RendererTraits): string => {
  if (traits.Gasveteran === 'Battle-Scarred')
    return "I'm a Battle-Scarred holder."
  if (traits.Rarity === 'Elemental') return "I'm an Elemental holder."
  if (traits.Rarity === 'Rare') return "I'm a Rare holder."
  if (traits.Era === 'Founding') return "I'm a Founding-Era holder."
  if (traits.Era === 'Pioneer') return "I'm a Pioneer Age holder."
  if (traits.Depth === 'Domainer') return "I'm a Domainer."
  const eraName = {
    DeFi: 'DeFi Summer',
    NFT: 'NFT Mania',
    Merge: 'Merge Era',
    Surge: 'Surge Era',
  }[traits.Era]
  return `I'm a ${eraName} holder.`
}

export const buildCommemorativeNftShareUrls = (
  externalUrl: string | undefined,
  minted: boolean,
  traits: RendererTraits,
): CommemorativeNftShareUrls => {
  if (!externalUrl || !minted) return {}

  const introduction = 'Upgraded to ENSv2 and minted my card.'
  const text = `${introduction}\n${getShareTraitLine(traits)}`
  const message = `${text}\n${externalUrl}`
  return {
    external: externalUrl,
    message,
    // X inserts a space before a separate url parameter, so keep the URL in text.
    x: `https://x.com/intent/post?${new URLSearchParams({ text: message })}`,
    telegram: `https://t.me/share/url?${new URLSearchParams({ text, url: externalUrl })}`,
  }
}

export const buildCommemorativeNftMarketplaceUrl = (params: {
  readonly chainId: number
  readonly ownerAddress: Address
  readonly minted: boolean
}): string | undefined => {
  if (!params.minted) return undefined

  const assetBaseUrl =
    params.chainId === mainnet.id
      ? 'https://opensea.io/assets/ethereum'
      : params.chainId === sepolia.id
        ? 'https://testnets.opensea.io/assets/sepolia'
        : undefined
  if (!assetBaseUrl) return undefined

  const contractAddress = getCommemorativeNftContractAddress(params.chainId)
  if (!contractAddress) return undefined

  const tokenId = getCommemorativeNftTokenId(params.ownerAddress).toString()
  // Retain the chain-specific asset link for Sepolia previews, although
  // OpenSea no longer indexes testnets.
  return `${assetBaseUrl}/${contractAddress}/${tokenId}`
}
