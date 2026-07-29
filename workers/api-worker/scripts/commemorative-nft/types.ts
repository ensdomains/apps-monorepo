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

export type SnapshotRow = {
  readonly address: Address
  readonly profileName: string
  readonly rendererName: string
  readonly traits: RendererTraits
}

export type LoadedSnapshot = {
  readonly duplicateRowCount: number
  readonly rows: readonly SnapshotRow[]
  readonly sourceRowCount: number
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

export type PipelineManifest = {
  readonly schemaVersion: number
  readonly eligibleAddressCount: number
  readonly sourceRowCount: number
  readonly duplicateRowCount: number
  readonly merkleRoot: Hex
  readonly seedDerivation: string
  readonly eligibilityKeyFormat: 'eligibility/<lowercase-address>.json'
  readonly renderInputKeyFormat: 'render-input/<decimal-token-id>.json'
}

export type Artifact = {
  readonly body: string
  readonly cacheControl: string
  readonly contentType: string
  readonly key: string
}

export type ArtifactWriter = {
  readonly write: (artifact: Artifact) => Promise<void>
}
