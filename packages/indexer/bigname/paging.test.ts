import { errAsync, okAsync } from 'neverthrow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

/** Runs the stale backoff on fake timers instead of waiting it out. */
const settle = async <T>(result: PromiseLike<T>): Promise<T> => {
  const settled = Promise.resolve(result)
  await vi.runAllTimersAsync()
  return settled
}

describe('readAllCollectionPages', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reads every page in order', async () => {
    const read = vi.fn((cursor?: string) =>
      cursor === undefined ? envelope([1, 2], 'c2') : envelope([3], null),
    )

    const rows = await settle(readAllCollectionPages(read))

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

    const rows = await settle(readAllCollectionPages(read))

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

    const rows = await settle(readAllCollectionPages(read))

    expect(rows._unsafeUnwrap()).toEqual([10])
  })

  it('starts over only once when the restarted read stays stale too', async () => {
    const read = vi.fn((cursor?: string) =>
      cursor === undefined ? envelope([1], 'c2') : errAsync(stale()),
    )

    const rows = await settle(readAllCollectionPages(read))

    expect(rows._unsafeUnwrapErr().code).toBe('stale')
    expect(
      read.mock.calls.filter(([cursor]) => cursor === undefined),
    ).toHaveLength(2)
  })

  it('reads a long collection again only once after a late stale page', async () => {
    const read = vi.fn((cursor?: string) => {
      if (cursor === undefined) return envelope([1], 'c2')
      if (cursor === 'c2') return envelope([2], 'c3')
      return errAsync(stale())
    })

    const rows = await settle(readAllCollectionPages(read))

    expect(rows._unsafeUnwrapErr().code).toBe('stale')
    expect(
      read.mock.calls.filter(([cursor]) => cursor === undefined),
    ).toHaveLength(2)
  })

  it('fails instead of looping when bigname repeats a cursor', async () => {
    const read = vi.fn((cursor?: string) =>
      envelope([cursor === undefined ? 1 : 2], 'same'),
    )

    const rows = await settle(readAllCollectionPages(read))

    expect(rows._unsafeUnwrapErr().code).toBe('malformed_response')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('stops reading once the signal aborts', async () => {
    const controller = new AbortController()
    const read = vi.fn((cursor?: string) => {
      if (cursor === undefined) controller.abort()
      return envelope([1], cursor === undefined ? 'c2' : null)
    })

    const rows = await settle(
      readAllCollectionPages(read, {
        signal: controller.signal,
      }),
    )

    expect(rows.isErr()).toBe(true)
    expect(read).toHaveBeenCalledOnce()
  })

  it('hands the signal to the request and stops retrying once it aborts', async () => {
    const controller = new AbortController()
    const read = vi.fn((_cursor?: string, _signal?: AbortSignal) => {
      controller.abort()
      return errAsync(stale())
    })

    // No timers are run: an aborted read must not wait out the backoff.
    const rows = await readAllCollectionPages(read, {
      signal: controller.signal,
    })

    expect(rows._unsafeUnwrapErr().code).toBe('stale')
    expect(read).toHaveBeenCalledOnce()
    expect(read.mock.calls[0]?.[1]).toBe(controller.signal)
  })

  it('stops paging once the limit is passed', async () => {
    const read = vi.fn((cursor?: string) =>
      cursor === undefined ? envelope([1, 2], 'c2') : envelope([3, 4], 'c3'),
    )

    const rows = await settle(readAllCollectionPages(read, { limit: 3 }))

    expect(rows._unsafeUnwrap()).toEqual([1, 2, 3, 4])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('fails on any other error', async () => {
    const read = vi.fn(() =>
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )

    const rows = await settle(readAllCollectionPages(read))

    expect(rows._unsafeUnwrapErr().code).toBe('overloaded')
    expect(read).toHaveBeenCalledOnce()
  })
})
