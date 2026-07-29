export const COMMEMORATIVE_NFT_TRAIT_VALUES = {
  Era: ['Founding', 'Pioneer', 'DeFi', 'NFT', 'Merge', 'Surge'],
  Depth: ['Singular', 'Namer', 'Collector', 'Domainer'],
  Gasveteran: ['Battle-Scarred', 'Weathered', 'Seasoned', 'Fresh'],
  Archetype: ['Personal', 'Common', 'Numeric', 'Brand', 'Abstract', 'Symbolic'],
  Rarity: ['Elemental', 'Rare', 'Uncommon', 'Common'],
} as const

export const COMMEMORATIVE_NFT_DESCRIPTION =
  'A commemorative NFT marking the migration to ENSv2.'

export const DEFAULT_WRITE_CONCURRENCY = 32
export const UINT32_MAX = 2 ** 32 - 1

export const PIPELINE_MANIFEST_SCHEMA_VERSION = 1
export const SEED_DERIVATION =
  'lowUint32(keccak256("seed:" + lowercaseRendererName))'
