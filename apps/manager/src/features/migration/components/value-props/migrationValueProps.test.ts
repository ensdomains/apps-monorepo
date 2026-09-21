import { describe, expect, it } from 'vitest'
import { getMigrationValuePropSlides } from './migrationValueProps'

describe('getMigrationValuePropSlides', () => {
  it('adds the NFT slide only when NFT visibility is confirmed', () => {
    const ordinarySlides = getMigrationValuePropSlides()
    expect(ordinarySlides.some((slide) => slide.id === 'nft')).toBe(false)
    expect(getMigrationValuePropSlides(true)).toEqual([
      ...ordinarySlides,
      expect.objectContaining({ id: 'nft' }),
    ])
  })
})
