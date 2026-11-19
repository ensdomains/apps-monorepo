import { describe, expect, it } from 'vitest'
import { getDashboardSearch, getPageWindow } from './pagination'

describe('getDashboardSearch', () => {
  it.each([undefined, 0, 1, -1, 2.5, 'invalid', [2, 3], Infinity])(
    'uses the first page for %j',
    (page) => expect(getDashboardSearch({ page }).page).toBeUndefined(),
  )

  it('keeps a valid later page', () => {
    expect(getDashboardSearch({ page: 3 }).page).toBe(3)
  })
})

describe('getPageWindow', () => {
  it('returns every page when total is small', () => {
    expect(getPageWindow(1, 1)).toEqual([1])
    expect(getPageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('clamps an out-of-range current page into the window', () => {
    expect(getPageWindow(99, 3)).toEqual([1, 2, 3])
    expect(getPageWindow(0, 3)).toEqual([1, 2, 3])
  })

  it('shows a trailing ellipsis when current is near the start', () => {
    expect(getPageWindow(2, 20)).toEqual([1, 2, 3, 'ellipsis', 20])
  })

  it('shows a leading ellipsis when current is near the end', () => {
    expect(getPageWindow(19, 20)).toEqual([1, 'ellipsis', 18, 19, 20])
  })

  it('shows ellipses on both sides when current is in the middle', () => {
    expect(getPageWindow(10, 20)).toEqual([
      1,
      'ellipsis',
      9,
      10,
      11,
      'ellipsis',
      20,
    ])
  })
})
