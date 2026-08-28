export const COMMEMORATIVE_NFT_TRAIT_VALUES = {
  Era: ['Founding', 'Pioneer', 'DeFi', 'NFT', 'Merge', 'Surge'],
  Depth: ['Singular', 'Namer', 'Collector', 'Domainer'],
  Gasveteran: ['Battle-Scarred', 'Weathered', 'Seasoned', 'Fresh'],
  Archetype: ['Personal', 'Common', 'Numeric', 'Brand', 'Abstract', 'Symbolic'],
  Rarity: ['Elemental', 'Rare', 'Uncommon', 'Common'],
} as const

export const UINT32_MAX = 2 ** 32 - 1

export const COMMEMORATIVE_NFT_DESCRIPTION =
  'A commemorative NFT marking the migration to ENSv2.'

export const REVIEWED_PILOT_SNAPSHOT_INPUTS = [
  {
    name: 'bq-results-20260622-151420-1782141290736.with_primary_name.csv',
    sha256: '14f2178e123b51d46cdf586f2163a1aee317136f7edc14a718a40ad7f94399f3',
  },
  {
    name: 'bq-results-20260622-151615-1782141389373.with_primary_name.csv',
    sha256: '3fcfa886951492378d474312bb64650a27feb13d61adbbe09d4a505a16111bb0',
  },
] as const

// Simon still needs to approve this before the production dataset is frozen.
export const SEED_DERIVATION =
  'PROVISIONAL: lowUint32(keccak256("seed:" + lowercaseRendererName))'

export const TOKEN_DIRECTORY = 'token'

export const NAME_CODE_POINT_THRESHOLDS = {
  long: 63,
  veryLong: 255,
  extreme: 1_024,
} as const
