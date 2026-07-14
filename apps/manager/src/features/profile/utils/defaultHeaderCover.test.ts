import { describe, expect, it } from 'vitest'
import citrineCover from '@/assets/profile/default-covers/citrine.png'
import garnetCover from '@/assets/profile/default-covers/garnet.png'
import graceCover from '@/assets/profile/default-covers/grace.png'
import lapisCover from '@/assets/profile/default-covers/lapis.png'
import peridotCover from '@/assets/profile/default-covers/peridot.png'
import quartzCover from '@/assets/profile/default-covers/quartz.png'
import { getDefaultHeaderCover } from './defaultHeaderCover'

describe('getDefaultHeaderCover', () => {
  it.each([
    ['#02293B', quartzCover],
    ['#E72A96', garnetCover],
    ['#0082BB', lapisCover],
    ['#007C20', peridotCover],
    ['#984D1B', citrineCover],
  ])('uses the matching cover for the %s profile theme', (themeColor, cover) => {
    expect(getDefaultHeaderCover({ themeColor })).toBe(cover)
  })

  it('uses Lapis when the profile has no saved theme', () => {
    expect(getDefaultHeaderCover({})).toBe(lapisCover)
  })

  it('resolves legacy theme aliases', () => {
    expect(getDefaultHeaderCover({ themeColor: '#ED2496' })).toBe(garnetCover)
  })

  it('uses the red cover during the grace period', () => {
    expect(
      getDefaultHeaderCover({ isInGrace: true, themeColor: '#007C20' }),
    ).toBe(graceCover)
  })
})
