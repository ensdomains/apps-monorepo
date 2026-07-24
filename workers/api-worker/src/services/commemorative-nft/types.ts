import type { Address, Hex } from 'viem'
import type { COMMEMORATIVE_NFT_TRAIT_VALUES } from './constants'

export type RendererTraits = {
  readonly Era: (typeof COMMEMORATIVE_NFT_TRAIT_VALUES.Era)[number]
  readonly Depth: (typeof COMMEMORATIVE_NFT_TRAIT_VALUES.Depth)[number]
  readonly Gasveteran: (typeof COMMEMORATIVE_NFT_TRAIT_VALUES.Gasveteran)[number]
  readonly Archetype: (typeof COMMEMORATIVE_NFT_TRAIT_VALUES.Archetype)[number]
  readonly Rarity: (typeof COMMEMORATIVE_NFT_TRAIT_VALUES.Rarity)[number]
  readonly Seed: number
}

export type RendererAttribute = {
  readonly trait_type: keyof RendererTraits
  readonly value: RendererTraits[keyof RendererTraits]
}

export type CommemorativeNftEligibility = {
  readonly address: Address
  readonly name: string
  readonly profileName: string
  readonly rendererName: string
  readonly tokenId: string
  readonly proof: readonly Hex[]
  readonly traits: RendererTraits
  readonly attributes: readonly RendererAttribute[]
}

export type CommemorativeNftRenderInput = {
  readonly name: string
  readonly description: string
  readonly image: ''
  readonly animation_url: ''
  readonly attributes: readonly RendererAttribute[]
}

export type CommemorativeNftMetadata = {
  readonly name: string
  readonly description: string
  readonly image: string
  readonly animation_url: string
  readonly external_url?: string
  readonly attributes: readonly RendererAttribute[]
}
