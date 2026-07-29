import { keccak256, stringToBytes } from 'viem'
import { COMMEMORATIVE_NFT_TRAIT_VALUES, UINT32_MAX } from './constants'
import type { RendererAttribute, RendererTraits } from './types'

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

const mapEnumValue = <Key extends EnumKey>(
  key: Key,
  value: string,
): RendererTraits[Key] => {
  const trimmedValue = value.trim()
  const aliases = VALUE_ALIASES[key as keyof typeof VALUE_ALIASES] as
    | Readonly<Record<string, string>>
    | undefined
  const aliasedValue = aliases?.[trimmedValue] ?? trimmedValue
  const validValues = COMMEMORATIVE_NFT_TRAIT_VALUES[key]
  const matchedValue = validValues.find(
    (validValue) =>
      validValue.toLowerCase() === aliasedValue.toLocaleLowerCase('en-US'),
  )

  if (!matchedValue) {
    throw new Error(`Invalid ${key} trait value: ${value}`)
  }

  return matchedValue as RendererTraits[Key]
}

export const normalizeProfileName = (value: string): string => {
  const normalizedValue = value.trim().normalize('NFC')
  if (!normalizedValue) throw new Error('A display name is required')

  const rendererName = normalizedValue.replace(/\.eth$/i, '')
  if (!rendererName) throw new Error('A renderer name is required')
  return `${rendererName}.eth`
}

export const getRendererName = (profileName: string): string =>
  profileName.replace(/\.eth$/i, '')

export const getRarity = (rendererName: string): RendererTraits['Rarity'] => {
  const firstLabel = rendererName.split('.')[0] ?? ''
  const labelLength = Array.from(firstLabel).length

  if (labelLength <= 3) return 'Elemental'
  if (labelLength === 4) return 'Rare'
  if (labelLength === 5) return 'Uncommon'
  return 'Common'
}

export const deriveRendererSeed = (rendererName: string): number => {
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
