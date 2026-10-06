import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearRecentlyMigratedNames,
  getRecentlyMigratedNames,
  recordRecentlyMigratedNames,
} from './recentlyMigratedNames'

const NOW = 1_700_000_000_000

describe('recentlyMigratedNames', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('hands back the names the migration recorded', () => {
    recordRecentlyMigratedNames(['alaska.eth', 'nevada.eth'], NOW)

    expect(getRecentlyMigratedNames(NOW + 1_000)).toEqual([
      'alaska.eth',
      'nevada.eth',
    ])
  })

  it('has nothing to say when no migration ran', () => {
    expect(getRecentlyMigratedNames(NOW)).toEqual([])
  })

  it('records nothing for an empty migration', () => {
    recordRecentlyMigratedNames([], NOW)

    expect(sessionStorage.getItem('ens-recently-migrated-names-v1')).toBeNull()
  })

  // A name that never arrives must stop the dashboard polling for it rather
  // than keep asking for the rest of the session.
  it('forgets names once they are no longer recent', () => {
    recordRecentlyMigratedNames(['alaska.eth'], NOW)

    expect(getRecentlyMigratedNames(NOW + 5 * 60 * 1000 + 1)).toEqual([])
    expect(sessionStorage.getItem('ens-recently-migrated-names-v1')).toBeNull()
  })

  it('forgets them once asked to', () => {
    recordRecentlyMigratedNames(['alaska.eth'], NOW)
    clearRecentlyMigratedNames()

    expect(getRecentlyMigratedNames(NOW)).toEqual([])
  })

  it('survives storage holding something else', () => {
    sessionStorage.setItem('ens-recently-migrated-names-v1', 'not json')
    expect(getRecentlyMigratedNames(NOW)).toEqual([])

    sessionStorage.setItem(
      'ens-recently-migrated-names-v1',
      JSON.stringify({ names: [1, 2], recordedAt: NOW }),
    )
    expect(getRecentlyMigratedNames(NOW)).toEqual([])
  })

  it('does not throw when storage refuses to write', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

    try {
      expect(() =>
        recordRecentlyMigratedNames(['alaska.eth'], NOW),
      ).not.toThrow()
    } finally {
      setItem.mockRestore()
    }
  })
})
