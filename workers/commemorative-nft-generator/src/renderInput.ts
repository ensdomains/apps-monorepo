export type RendererAttribute = {
  readonly trait_type: string
  readonly value: number | string
}

export type RenderInput = {
  readonly animation_url: string
  readonly attributes: readonly RendererAttribute[]
  readonly description: string
  readonly image: string
  readonly name: string
}

const TRAITS = new Set([
  'Era',
  'Depth',
  'Gasveteran',
  'Archetype',
  'Rarity',
  'Seed',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const parseRenderInput = (value: unknown): RenderInput => {
  if (!isRecord(value)) throw new Error('Render input must be an object')
  if (
    typeof value.name !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.image !== 'string' ||
    typeof value.animation_url !== 'string' ||
    !Array.isArray(value.attributes)
  ) {
    throw new Error('Render input does not match the metadata schema')
  }

  const attributes = value.attributes.map((attribute) => {
    if (
      !isRecord(attribute) ||
      typeof attribute.trait_type !== 'string' ||
      !TRAITS.has(attribute.trait_type) ||
      !['number', 'string'].includes(typeof attribute.value)
    ) {
      throw new Error('Render input contains an invalid attribute')
    }
    return {
      trait_type: attribute.trait_type,
      value: attribute.value as number | string,
    }
  })

  if (
    attributes.length !== TRAITS.size ||
    new Set(attributes.map(({ trait_type }) => trait_type)).size !== TRAITS.size
  ) {
    throw new Error(
      'Render input must contain each renderer trait exactly once',
    )
  }

  return {
    name: value.name,
    description: value.description,
    image: value.image,
    animation_url: value.animation_url,
    attributes,
  }
}
