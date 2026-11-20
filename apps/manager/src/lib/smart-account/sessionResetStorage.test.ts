import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSessionReset,
  readSessionResetNonce,
  saveSessionReset,
} from './sessionResetStorage'

const HCA: Address = '0xabcdef0123456789abcdef0123456789abcdef01'
const OTHER: Address = '0x0000000000000000000000000000000000000002'

describe('sessionResetStorage', () => {
  beforeEach(() => localStorage.clear())

  it('reads back the saved nonce, scoped by chain and account', () => {
    saveSessionReset(11155111, HCA, 3n)

    expect(readSessionResetNonce(11155111, HCA)).toBe(3n)
    expect(
      readSessionResetNonce(
        11155111,
        '0xABCDEF0123456789ABCDEF0123456789ABCDEF01' as Address,
      ),
    ).toBe(3n)
    expect(readSessionResetNonce(1, HCA)).toBeNull()
    expect(readSessionResetNonce(11155111, OTHER)).toBeNull()
  })

  it('clears only the given account', () => {
    saveSessionReset(11155111, HCA, 3n)
    saveSessionReset(11155111, OTHER, 1n)

    clearSessionReset(11155111, HCA)

    expect(readSessionResetNonce(11155111, HCA)).toBeNull()
    expect(readSessionResetNonce(11155111, OTHER)).toBe(1n)
  })

  it('ignores corrupt storage', () => {
    localStorage.setItem('ens-session-reset-v1', '{not json')
    expect(readSessionResetNonce(11155111, HCA)).toBeNull()

    localStorage.setItem(
      'ens-session-reset-v1',
      JSON.stringify({ [`11155111:${HCA}`]: 'abc' }),
    )
    expect(readSessionResetNonce(11155111, HCA)).toBeNull()
  })

  it('keeps a reset for this visit when storage refuses the save', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

    saveSessionReset(11155111, HCA, 3n)
    expect(readSessionResetNonce(11155111, HCA)).toBe(3n)

    clearSessionReset(11155111, HCA)
    expect(readSessionResetNonce(11155111, HCA)).toBeNull()

    // Once storage works again, it is the source of truth.
    setItem.mockRestore()
    saveSessionReset(11155111, HCA, 4n)
    expect(localStorage.getItem('ens-session-reset-v1')).toContain('"4"')
    clearSessionReset(11155111, HCA)
  })
})

describe('sessionResetStorage pending changes', () => {
  const STORAGE_KEY = 'ens-session-reset-v1'
  const HCA_KEY = `11155111:${HCA}`
  const OTHER_KEY = `11155111:${OTHER}`

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    localStorage.clear()
  })

  const failNextWrite = () =>
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError')
    })

  it('reads and preserves another tab update while a local save is pending', async () => {
    const storage = await import('./sessionResetStorage')
    failNextWrite()
    storage.saveSessionReset(11155111, HCA, 3n)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ [OTHER_KEY]: '7' }))

    expect(storage.readSessionResetNonce(11155111, HCA)).toBe(3n)
    expect(storage.readSessionResetNonce(11155111, OTHER)).toBe(7n)

    storage.saveSessionReset(11155111, HCA, 4n)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({
      [HCA_KEY]: '4',
      [OTHER_KEY]: '7',
    })
  })

  it('keeps a pending deletion without discarding another tab update', async () => {
    const storage = await import('./sessionResetStorage')
    storage.saveSessionReset(11155111, HCA, 3n)
    failNextWrite()
    storage.clearSessionReset(11155111, HCA)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [HCA_KEY]: '3', [OTHER_KEY]: '7' }),
    )

    expect(storage.readSessionResetNonce(11155111, HCA)).toBeNull()
    expect(storage.readSessionResetNonce(11155111, OTHER)).toBe(7n)

    storage.saveSessionReset(1, HCA, 9n)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({
      [OTHER_KEY]: '7',
      [`1:${HCA}`]: '9',
    })
  })

  it('does not restore a marker another tab deleted during a pending save', async () => {
    const storage = await import('./sessionResetStorage')
    storage.saveSessionReset(11155111, OTHER, 7n)
    failNextWrite()
    storage.saveSessionReset(11155111, HCA, 3n)
    localStorage.setItem(STORAGE_KEY, '{}')

    storage.saveSessionReset(11155111, HCA, 4n)
    expect(storage.readSessionResetNonce(11155111, HCA)).toBe(4n)
    expect(storage.readSessionResetNonce(11155111, OTHER)).toBeNull()
  })

  it('retains known markers when reads become unavailable after a failed save', async () => {
    const storage = await import('./sessionResetStorage')
    storage.saveSessionReset(11155111, HCA, 3n)
    failNextWrite()
    storage.saveSessionReset(11155111, OTHER, 7n)
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError')
      })

    try {
      expect(storage.readSessionResetNonce(11155111, HCA)).toBe(3n)
      expect(storage.readSessionResetNonce(11155111, OTHER)).toBe(7n)
    } finally {
      getItem.mockRestore()
    }
  })

  it('uses a later persisted value after pending changes have been saved', async () => {
    const storage = await import('./sessionResetStorage')
    failNextWrite()
    storage.saveSessionReset(11155111, HCA, 3n)
    storage.saveSessionReset(11155111, HCA, 4n)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ [HCA_KEY]: '9' }))

    expect(storage.readSessionResetNonce(11155111, HCA)).toBe(9n)
  })

  it('defers saving while reads are unavailable and merges after recovery', async () => {
    const storage = await import('./sessionResetStorage')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ [OTHER_KEY]: '7' }))
    const readPersisted = localStorage.getItem.bind(localStorage)
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError')
      })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    try {
      storage.saveSessionReset(11155111, HCA, 3n)
      expect(storage.readSessionResetNonce(11155111, HCA)).toBe(3n)
      expect(setItem).not.toHaveBeenCalled()
      expect(JSON.parse(readPersisted(STORAGE_KEY) ?? 'null')).toEqual({
        [OTHER_KEY]: '7',
      })
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }

    storage.saveSessionReset(11155111, HCA, 4n)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({
      [HCA_KEY]: '4',
      [OTHER_KEY]: '7',
    })
  })

  it('replaces readable corrupt JSON when saving a valid reset', async () => {
    const storage = await import('./sessionResetStorage')
    localStorage.setItem(STORAGE_KEY, '{not json')

    storage.saveSessionReset(11155111, HCA, 3n)
    expect(storage.readSessionResetNonce(11155111, HCA)).toBe(3n)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({
      [HCA_KEY]: '3',
    })
  })
})
