import { describe, expect, it } from 'vitest'
import { validateRendererInput } from './renderInput.js'

const INPUT = {
  animation_url: '',
  attributes: [
    { trait_type: 'Era', value: 'DeFi' },
    { trait_type: 'Depth', value: 'Collector' },
    { trait_type: 'Gasveteran', value: 'Seasoned' },
    { trait_type: 'Archetype', value: 'Abstract' },
    { trait_type: 'Rarity', value: 'Rare' },
    { trait_type: 'Seed', value: 3_780_441_947 },
  ],
  description: 'ENS commemorative NFT',
  image: '',
  name: '<img src=x onerror=alert(1)>.eth',
}

describe('renderer input validation', () => {
  it('accepts exact renderer traits while keeping names as data', () => {
    expect(() => validateRendererInput(INPUT)).not.toThrow()
  })

  it('rejects duplicate traits and invalid uint32 seeds', () => {
    expect(() =>
      validateRendererInput({
        ...INPUT,
        attributes: [...INPUT.attributes.slice(0, -1), INPUT.attributes[0]],
      }),
    ).toThrow('each renderer trait exactly once')
    expect(() =>
      validateRendererInput({
        ...INPUT,
        attributes: INPUT.attributes.map((attribute) =>
          attribute.trait_type === 'Seed'
            ? { ...attribute, value: -1 }
            : attribute,
        ),
      }),
    ).toThrow('invalid Seed')
  })

  it('rejects unknown renderer trait values', () => {
    expect(() =>
      validateRendererInput({
        ...INPUT,
        attributes: INPUT.attributes.map((attribute) =>
          attribute.trait_type === 'Era'
            ? { ...attribute, value: 'Genesis' }
            : attribute,
        ),
      }),
    ).toThrow('invalid Era')
  })
})
