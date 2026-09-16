import { describe, expect, it } from 'vitest'
import { getMigrationValuePropSlides } from './migrationValueProps'

describe('getMigrationValuePropSlides', () => {
  it('shows only ordinary migration benefits unless NFT visibility is confirmed', () => {
    expect(getMigrationValuePropSlides().map((slide) => slide.id)).toEqual([
      'profiles',
      'favorites',
      'notifications',
      'experience',
    ])
  })

  it('adds the NFT slide when commemorative NFT visibility is confirmed', () => {
    expect(getMigrationValuePropSlides(true).map((slide) => slide.id)).toEqual([
      'profiles',
      'favorites',
      'notifications',
      'experience',
      'nft',
    ])
  })

  it('removes NFT marketing again when the current owner becomes ineligible', () => {
    const ordinarySlides = getMigrationValuePropSlides(false)
    const eligibleSlides = getMigrationValuePropSlides(true)

    expect(getMigrationValuePropSlides(false)).toEqual(ordinarySlides)
    expect(eligibleSlides.filter((slide) => slide.id !== 'nft')).toEqual(
      ordinarySlides,
    )
  })

  it('keeps labels and media for all eligible slides', () => {
    for (const slide of getMigrationValuePropSlides(true)) {
      expect(slide.label).toBeDefined()
      expect(slide.media.src).toBeTruthy()
    }
  })
})
