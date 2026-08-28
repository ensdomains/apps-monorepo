import type { Address, Hex } from 'viem'
import type { COMMEMORATIVE_NFT_TRAIT_VALUES } from './constants.js'

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

export type DisplayNameSource = 'primary_name' | 'oldest_name'

export type SelectedSnapshotName = {
  readonly profileName: string
  readonly rendererName: string
  readonly source: DisplayNameSource
  readonly isNonEthPrimary: boolean
}

export type SnapshotRow = {
  readonly address: Address
  readonly tokenId: string
  readonly profileName: string
  readonly rendererName: string
  readonly displayNameSource: DisplayNameSource
  readonly daysHeld: number
  readonly snapshotWindow: string
  readonly traits: RendererTraits
  readonly sourcePath: string
  readonly sourceFileIndex: number
  readonly sourceRowNumber: number
  readonly sourceOrder: number
}

export type SnapshotAnomalyStats = {
  readonly nonEthPrimaryNameCount: number
  readonly longNameCount: number
  readonly over255CodePointNameCount: number
  readonly over1024CodePointNameCount: number
  readonly maximumNameCodePointLength: number
}

export type SnapshotStats = {
  readonly sourceRowCount: number
  readonly eligibleAddressCount: number
  readonly duplicateRowCount: number
  readonly duplicateAddressCount: number
  readonly conflictingDuplicateAddressCount: number
  readonly daysHeldTieAddressCount: number
  readonly conflictingDaysHeldTieAddressCount: number
  readonly selectedWindowCounts: Readonly<Record<string, number>>
  readonly anomalies: SnapshotAnomalyStats
}

export type LoadedSnapshot = {
  readonly rows: readonly SnapshotRow[]
  readonly sources: readonly SnapshotSource[]
  readonly stats: SnapshotStats
}

export type SnapshotSource = {
  readonly path: string
  readonly rowCount: number
  readonly sha256: string
}

export type SnapshotMerkleEntry = {
  readonly row: SnapshotRow
  readonly proof: readonly Hex[]
}

export type BuiltSnapshotMerkleTree = {
  readonly root: Hex
  readonly entries: readonly SnapshotMerkleEntry[]
  readonly proofsByAddress: ReadonlyMap<string, readonly Hex[]>
}

export type TokenArtifactPaths = {
  readonly metadata: `token/${string}.json`
  readonly image: `token/${string}.png`
}

export type TokenUrls = {
  readonly metadata: string
  readonly image: string
  readonly animation: string
  readonly external: string
}

export type TokenUrlOptions = {
  readonly assetOrigin: string | URL
  readonly rendererOrigin: string | URL
  readonly externalOrigin?: string | URL
}

export type TokenMetadata = {
  readonly name: string
  readonly description: string
  readonly profile_name: string
  readonly address: Address
  readonly token_id: string
  readonly proof: readonly Hex[]
  readonly seed: number
  readonly attributes: readonly RendererAttribute[]
  readonly image: string
  readonly animation_url: string
  readonly external_url: string
}
