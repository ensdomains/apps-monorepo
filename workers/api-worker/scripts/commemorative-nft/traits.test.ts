import { describe, expect, it } from 'vitest'
import {
  deriveRendererSeed,
  getRarity,
  getRendererName,
  mapRendererTraits,
  normalizeProfileName,
} from './traits'

describe('commemorative NFT renderer traits', () => {
  it('normalizes profile names once and preserves hostile text as data', () => {
    expect(normalizeProfileName(' yoginth.ETH ')).toBe('yoginth.eth')
    expect(normalizeProfileName('yoginth')).toBe('yoginth.eth')
    expect(normalizeProfileName('<img onerror=alert(1)>')).toBe(
      '<img onerror=alert(1)>.eth',
    )
    expect(getRendererName('yoginth.eth')).toBe('yoginth')
  })

  it('normalizes unicode before deriving the renderer name', () => {
    expect(normalizeProfileName('e\u0301thname')).toBe('éthname.eth')
  })

  it('rejects a suffix-only profile name', () => {
    expect(() => normalizeProfileName('.eth')).toThrow(
      'A renderer name is required',
    )
  })

  it('derives rarity from the first label by unicode code point', () => {
    expect(getRarity('ens')).toBe('Elemental')
    expect(getRarity('yogi')).toBe('Rare')
    expect(getRarity('henlo')).toBe('Uncommon')
    expect(getRarity('yoginth')).toBe('Common')
    expect(getRarity('💜💜💜.subname')).toBe('Elemental')
  })

  it('derives the published low-uint32 seed deterministically', () => {
    expect(deriveRendererSeed('yoginth')).toBe(3_780_441_947)
    expect(deriveRendererSeed(' YOGINTH ')).toBe(3_780_441_947)
    expect(deriveRendererSeed('yoginth')).toBeLessThanOrEqual(4_294_967_295)
  })

  it('maps snapshot aliases and the explicit Founding gas default', () => {
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

  it('rejects missing gas history outside the Founding era', () => {
    expect(() =>
      mapRendererTraits({
        genesisEra: 'NFT Mania',
        collectionDepth: 'Collector',
        gasVeteran: '',
        nameArchetype: 'Personal Name',
        rendererName: 'yoginth',
      }),
    ).toThrow('Missing Gasveteran')
  })

  it('rejects unknown snapshot trait values', () => {
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
