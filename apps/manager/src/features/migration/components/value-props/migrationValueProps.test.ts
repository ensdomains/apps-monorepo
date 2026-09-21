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
})
