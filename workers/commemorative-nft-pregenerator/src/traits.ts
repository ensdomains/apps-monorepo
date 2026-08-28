import { keccak256, stringToBytes } from 'viem'
import { COMMEMORATIVE_NFT_TRAIT_VALUES, UINT32_MAX } from './constants.js'
import type {
  RendererAttribute,
  RendererTraits,
  SelectedSnapshotName,
} from './types.js'

type EnumKey = Exclude<keyof RendererTraits, 'Seed'>

const VALUE_ALIASES = {
  Era: {
    'The Founding': 'Founding',
    'Pioneer Age': 'Pioneer',
    'DeFi Summer': 'DeFi',
    'NFT Mania': 'NFT',
    'Merge Era': 'Merge',
    'Surge Era': 'Surge',
  },
  Archetype: {
    'Abstract/Compound': 'Abstract',
    'Brand/Proper': 'Brand',
    'Common Noun': 'Common',
    'Personal Name': 'Personal',
  },
} as const

const comparisonKey = (value: string): string =>
  value.toLocaleLowerCase('en-US')

const getAliasedValue = (key: EnumKey, value: string): string => {
  const aliases = VALUE_ALIASES[key as keyof typeof VALUE_ALIASES] as
    | Readonly<Record<string, string>>
    | undefined
  if (!aliases) return value

  const normalizedValue = comparisonKey(value)
  const alias = Object.entries(aliases).find(
    ([candidate]) => comparisonKey(candidate) === normalizedValue,
  )
  return alias?.[1] ?? value
}

const tryMapEnumValue = <Key extends EnumKey>(
  key: Key,
  value: string,
): RendererTraits[Key] | undefined => {
  const trimmedValue = value.trim()
  const aliasedValue = getAliasedValue(key, trimmedValue)
  const normalizedValue = comparisonKey(aliasedValue)
  const validValues = COMMEMORATIVE_NFT_TRAIT_VALUES[key]

  return validValues.find(
    (validValue) => comparisonKey(validValue) === normalizedValue,
  ) as RendererTraits[Key] | undefined
}

const mapEnumValue = <Key extends EnumKey>(
  key: Key,
  value: string,
): RendererTraits[Key] => {
  const mappedValue = tryMapEnumValue(key, value)
  if (!mappedValue) throw new Error(`Invalid ${key} trait value: ${value}`)
  return mappedValue
}

export const looksLikeLegacySwappedTraitColumns = (values: {
  readonly genesisEra: string
  readonly gasVeteran: string
}): boolean =>
  tryMapEnumValue('Era', values.gasVeteran) !== undefined &&
  (!values.genesisEra.trim() ||
    tryMapEnumValue('Gasveteran', values.genesisEra) !== undefined)

export const normalizeSnapshotName = (value: string): string => {
  const normalizedValue = value.trim().normalize('NFC')
  if (!normalizedValue) throw new Error('A display name is required')
  return normalizedValue
}

export const selectSnapshotName = (values: {
  readonly primaryName?: string
  readonly oldestName?: string
}): SelectedSnapshotName => {
  const primaryName = values.primaryName?.trim()
  if (primaryName) {
    const profileName = normalizeSnapshotName(primaryName)
    const rendererName = profileName.replace(/\.eth$/i, '')
    if (!rendererName) throw new Error('A renderer name is required')

    return {
      profileName,
      rendererName,
      source: 'primary_name',
      isNonEthPrimary: !/\.eth$/i.test(profileName),
    }
  }

  const oldestName = normalizeSnapshotName(values.oldestName ?? '')
  const profileName = /\.eth$/i.test(oldestName)
    ? oldestName
    : `${oldestName}.eth`
  const rendererName = profileName.replace(/\.eth$/i, '')
  if (!rendererName) throw new Error('A renderer name is required')

  return {
    profileName,
    rendererName,
    source: 'oldest_name',
    isNonEthPrimary: false,
  }
}

export const getRarity = (rendererName: string): RendererTraits['Rarity'] => {
  const firstLabel = rendererName.split('.')[0] ?? ''
  const labelLength = Array.from(firstLabel).length

  if (labelLength <= 3) return 'Elemental'
  if (labelLength === 4) return 'Rare'
  if (labelLength === 5) return 'Uncommon'
  return 'Common'
}

export const deriveRendererSeed = (rendererName: string): number => {
  // Keep this byte-for-byte equivalent to the WEB-605 derivation while the
  // production seed contract remains provisional.
  const normalizedName = rendererName.trim().normalize('NFC').toLowerCase()
  const hash = keccak256(stringToBytes(`seed:${normalizedName}`))
  const seed = Number.parseInt(hash.slice(-8), 16)

  if (!Number.isSafeInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new Error('Derived renderer seed is outside uint32')
  }

  return seed
}

export const mapRendererTraits = (values: {
  readonly genesisEra: string
  readonly collectionDepth: string
  readonly gasVeteran: string
  readonly nameArchetype: string
  readonly rendererName: string
}): RendererTraits => {
  const Era = mapEnumValue('Era', values.genesisEra)
  const gasVeteran = values.gasVeteran.trim()

  if (!gasVeteran && Era !== 'Founding') {
    throw new Error('Missing Gasveteran trait outside the Founding era')
  }

  return {
    Era,
    Depth: mapEnumValue('Depth', values.collectionDepth),
    Gasveteran: mapEnumValue('Gasveteran', gasVeteran || 'Battle-Scarred'),
    Archetype: mapEnumValue('Archetype', values.nameArchetype),
    Rarity: getRarity(values.rendererName),
    Seed: deriveRendererSeed(values.rendererName),
  }
}

export const getRendererAttributes = (
  traits: RendererTraits,
): readonly RendererAttribute[] => [
  { trait_type: 'Era', value: traits.Era },
  { trait_type: 'Depth', value: traits.Depth },
  { trait_type: 'Gasveteran', value: traits.Gasveteran },
  { trait_type: 'Archetype', value: traits.Archetype },
  { trait_type: 'Rarity', value: traits.Rarity },
  { trait_type: 'Seed', value: traits.Seed },
]
