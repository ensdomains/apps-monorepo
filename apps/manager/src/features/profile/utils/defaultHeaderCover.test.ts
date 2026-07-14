import { describe, expect, it } from 'vitest'
import { getDefaultHeaderCover } from './defaultHeaderCover'

const decodeSvg = (cover: string): string => {
  const [, encodedSvg] = cover.split(',')
  return decodeURIComponent(encodedSvg ?? '')
}

describe('getDefaultHeaderCover', () => {
  it.each([
    ['#02293B', '3514:13079', '#02293B'],
    ['#E72A96', '3514:13081', '#E72A96'],
    ['#0082BB', '3514:13078', '#0082BB'],
    ['#007C20', '3514:13077', '#007C20'],
    ['#984D1B', '3894:147470', '#984D1B'],
  ])('generates the matching Figma SVG cover for the %s profile theme', (themeColor, figmaNodeId, blendColor) => {
    const cover = getDefaultHeaderCover({ themeColor })
    const svg = decodeSvg(cover)

    expect(cover).toMatch(/^data:image\/svg\+xml,/)
    expect(svg).toContain(`data-figma-node-id="${figmaNodeId}"`)
    expect(svg).toContain(`fill="${blendColor}" style="mix-blend-mode:color"`)
    expect(svg).toContain('<use href="#')
    expect(svg).not.toContain('<image')
    expect(svg).not.toContain('data:image/png')
  })

  it('uses Lapis when the profile has no saved theme', () => {
    expect(decodeSvg(getDefaultHeaderCover({}))).toContain(
      'data-figma-node-id="3514:13078"',
    )
  })

  it('resolves legacy theme aliases to the same cached SVG', () => {
    expect(getDefaultHeaderCover({ themeColor: '#ED2496' })).toBe(
      getDefaultHeaderCover({ themeColor: '#E72A96' }),
    )
  })

  it('uses the exact red blend from Figma during the grace period', () => {
    const svg = decodeSvg(
      getDefaultHeaderCover({ isInGrace: true, themeColor: '#007C20' }),
    )

    expect(svg).toContain('data-figma-node-id="4379:10976"')
    expect(svg).toContain('fill="#87514C" style="mix-blend-mode:color"')
  })
})
