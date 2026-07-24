import { describe, expect, it } from 'vitest'
import {
  deriveRendererSeed,
  getRarity,
  getRendererName,
  mapRendererTraits,
  normalizeProfileName,
} from './traits'

describe('commemorative NFT trait mapping', () => {
  it('normalizes primary and oldest names exactly once', () => {
    expect(normalizeProfileName('yoginth.eth')).toBe('yoginth.eth')
    expect(normalizeProfileName('yoginth')).toBe('yoginth.eth')
    expect(getRendererName('yoginth.eth')).toBe('yoginth')
  })

  it('derives rarity from label length', () => {
    expect(getRarity('ens')).toBe('Elemental')
    expect(getRarity('yogi')).toBe('Rare')
    expect(getRarity('henlo')).toBe('Uncommon')
    expect(getRarity('yoginth')).toBe('Common')
  })

  it('matches the published renderer fixture seed', () => {
    expect(deriveRendererSeed('yoginth')).toBe(3_780_441_947)
  })

  it('maps corrected snapshot columns and explicit founding gas default', () => {
    expect(
      mapRendererTraits({
        genesisEra: 'The Founding',
        collectionDepth: 'Collector',
        gasVeteran: '',
        nameArchetype: 'Abstract/Compound',
        rendererName: 'yoginth',
      }),
    ).toEqual({
      Era: 'Founding',
      Depth: 'Collector',
      Gasveteran: 'Battle-Scarred',
      Archetype: 'Abstract',
      Rarity: 'Common',
      Seed: 3_780_441_947,
    })
  })

  it('rejects unknown snapshot values instead of silently defaulting', () => {
    expect(() =>
      mapRendererTraits({
        genesisEra: 'unknown',
        collectionDepth: 'Collector',
        gasVeteran: 'Fresh',
        nameArchetype: 'Personal Name',
        rendererName: 'yoginth',
      }),
    ).toThrow('Invalid Era trait value')
  })
})
