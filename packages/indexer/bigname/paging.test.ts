import { errAsync, okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { BignameError } from './errors'
import { readAllCollectionPages } from './paging'

const stale = () => new BignameError({ code: 'stale', message: 'stale' })

const envelope = (data: readonly number[], next: string | null) =>
  okAsync({
    data,
    page: {
      cursor: null,
      next_cursor: next,
      page_size: data.length,
      total_count: null,
      has_more: next !== null,
    },
    meta: { as_of: {} },
  })

describe('readAllCollectionPages', () => {
  it('reads every page in order', async () => {
    const read = vi.fn((cursor?: string) =>
      cursor === undefined ? envelope([1, 2], 'c2') : envelope([3], null),
    )

    const rows = await readAllCollectionPages(read)

    expect(rows._unsafeUnwrap()).toEqual([1, 2, 3])
    expect(read.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, 'c2'])
  })

  it('sends a stale page again with the same cursor', async () => {
    let attempts = 0
    const read = vi.fn((cursor?: string) => {
      if (cursor === undefined) return envelope([1], 'c2')
      attempts += 1
      return attempts === 1 ? errAsync(stale()) : envelope([2], null)
    })

    const rows = await readAllCollectionPages(read)

    expect(rows._unsafeUnwrap()).toEqual([1, 2])
    expect(read.mock.calls.map(([cursor]) => cursor)).toEqual([
      undefined,
      'c2',
      'c2',
    ])
  })

  it('starts over once when a cursor stays stale', async () => {
    let restarted = false
    const read = vi.fn((cursor?: string) => {
      if (cursor === undefined) {
        const first = envelope([restarted ? 10 : 1], restarted ? null : 'old')
        restarted = true
        return first
      }
      return errAsync(stale())
    })

    const rows = await readAllCollectionPages(read)

    expect(rows._unsafeUnwrap()).toEqual([10])
  })

  it('stops paging once the limit is passed', async () => {
    const read = vi.fn((cursor?: string) =>
      cursor === undefined ? envelope([1, 2], 'c2') : envelope([3, 4], 'c3'),
    )

    const rows = await readAllCollectionPages(read, { limit: 3 })

    expect(rows._unsafeUnwrap()).toEqual([1, 2, 3, 4])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('fails on any other error', async () => {
    const read = vi.fn(() =>
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )

    const rows = await readAllCollectionPages(read)

    expect(rows._unsafeUnwrapErr().code).toBe('overloaded')
    expect(read).toHaveBeenCalledOnce()
  })
})
