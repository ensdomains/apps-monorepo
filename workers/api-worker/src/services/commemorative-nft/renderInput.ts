const RENDERER_TRAIT_VALUES = {
  Archetype: new Set([
    'Personal',
    'Common',
    'Numeric',
    'Brand',
    'Abstract',
    'Symbolic',
  ]),
  Depth: new Set(['Singular', 'Namer', 'Collector', 'Domainer']),
  Era: new Set(['Founding', 'Pioneer', 'DeFi', 'NFT', 'Merge', 'Surge']),
  Gasveteran: new Set(['Battle-Scarred', 'Weathered', 'Seasoned', 'Fresh']),
  Rarity: new Set(['Elemental', 'Rare', 'Uncommon', 'Common']),
} as const

type StringRendererTrait = keyof typeof RENDERER_TRAIT_VALUES
type RendererTrait = StringRendererTrait | 'Seed'

const RENDERER_TRAITS = new Set<RendererTrait>([
  ...(Object.keys(RENDERER_TRAIT_VALUES) as StringRendererTrait[]),
  'Seed',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const validateRendererInput = (value: unknown): void => {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    value.name.length === 0 ||
    typeof value.description !== 'string' ||
    typeof value.image !== 'string' ||
    typeof value.animation_url !== 'string' ||
    !Array.isArray(value.attributes)
  ) {
    throw new Error('Render input does not match the metadata schema')
  }

  const traitNames = value.attributes.map((attribute) => {
    if (!isRecord(attribute) || typeof attribute.trait_type !== 'string') {
      throw new Error('Render input contains an invalid attribute')
    }

    const traitName = attribute.trait_type as RendererTrait
    if (!RENDERER_TRAITS.has(traitName)) {
      throw new Error('Render input contains an invalid attribute')
    }

    if (traitName === 'Seed') {
      if (
        typeof attribute.value !== 'number' ||
        !Number.isSafeInteger(attribute.value) ||
        attribute.value < 0 ||
        attribute.value > 0xffff_ffff
      ) {
        throw new Error('Render input contains an invalid Seed')
      }
    } else if (
      typeof attribute.value !== 'string' ||
      !RENDERER_TRAIT_VALUES[traitName].has(attribute.value)
    ) {
      throw new Error(`Render input contains an invalid ${traitName}`)
    }

    return traitName
  })

  if (
    traitNames.length !== RENDERER_TRAITS.size ||
    new Set(traitNames).size !== RENDERER_TRAITS.size
  ) {
    throw new Error(
      'Render input must contain each renderer trait exactly once',
    )
  }
}
