import { describe, expect, it } from 'vitest'
import { parseRenderInput } from '../src/renderInput.js'

const INPUT = {
  animation_url: '',
  attributes: [
    { trait_type: 'Era', value: 'DeFi' },
    { trait_type: 'Depth', value: 'Collector' },
    { trait_type: 'Gasveteran', value: 'Seasoned' },
    { trait_type: 'Archetype', value: 'Abstract' },
    { trait_type: 'Rarity', value: 'Rare' },
    { trait_type: 'Seed', value: 4_294_967_295 },
  ],
  description: 'ENS commemorative NFT',
  image: '',
  name: '<script>alert(1)</script>.eth',
}

describe('render input validation', () => {
  it('keeps hostile names as inert JSON data', () => {
    expect(parseRenderInput(INPUT).name).toBe('<script>alert(1)</script>.eth')
  })

  it('requires every renderer trait exactly once', () => {
    expect(() =>
      parseRenderInput({
        ...INPUT,
        attributes: [...INPUT.attributes.slice(0, -1), INPUT.attributes[0]],
      }),
    ).toThrow('each renderer trait exactly once')
  })

  it('rejects a seed outside uint32', () => {
    expect(() =>
      parseRenderInput({
        ...INPUT,
        attributes: INPUT.attributes.map((attribute) =>
          attribute.trait_type === 'Seed'
            ? { ...attribute, value: 4_294_967_296 }
            : attribute,
        ),
      }),
    ).toThrow('invalid Seed')
  })

  it('rejects unknown renderer trait values', () => {
    expect(() =>
      parseRenderInput({
        ...INPUT,
        attributes: INPUT.attributes.map((attribute) =>
          attribute.trait_type === 'Depth'
            ? { ...attribute, value: 'Deep' }
            : attribute,
        ),
      }),
    ).toThrow('invalid Depth')
  })
})
