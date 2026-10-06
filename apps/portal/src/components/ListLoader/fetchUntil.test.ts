import { describe, expect, it, vi } from 'vitest'
import { type FetchMoreResult, fetchUntil } from './fetchUntil'

/** A source of `total` rows served `pageSize` at a time. */
const pagedSource = (total: number, pageSize: number, alreadyLoaded = 0) => {
  let loaded = alreadyLoaded
  return vi.fn(async (): Promise<FetchMoreResult> => {
    loaded = Math.min(total, loaded + pageSize)
    return { loaded, hasMore: loaded < total }
  })
}

describe('fetchUntil', () => {
  it('fetches nothing when the target is already loaded', async () => {
    const fetchMore = pagedSource(1000, 100, 100)

    const result = await fetchUntil({
      target: 80,
      loaded: 100,
      hasMore: true,
      fetchMore,
    })

    expect(fetchMore).not.toHaveBeenCalled()
    expect(result).toEqual({ loaded: 100, hasMore: true })
  })

  // Doubling 100 rows to 200 on 40-row pages is three fetches, not one.
  it('fetches as many pages as the target takes', async () => {
    const fetchMore = pagedSource(1000, 40, 100)

    const result = await fetchUntil({
      target: 200,
      loaded: 100,
      hasMore: true,
      fetchMore,
    })

    expect(fetchMore).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ loaded: 220, hasMore: true })
  })

  it('loads everything for an unbounded target, then stops', async () => {
    const fetchMore = pagedSource(250, 100)

    const result = await fetchUntil({
      target: Number.POSITIVE_INFINITY,
      loaded: 0,
      hasMore: true,
      fetchMore,
    })

    expect(fetchMore).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ loaded: 250, hasMore: false })
  })

  it('stops when the list runs out short of the target', async () => {
    const fetchMore = pagedSource(120, 100, 100)

    const result = await fetchUntil({
      target: 400,
      loaded: 100,
      hasMore: true,
      fetchMore,
    })

    expect(fetchMore).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ loaded: 120, hasMore: false })
  })

  // A cursor that stopped advancing while still claiming more would otherwise
  // be asked forever.
  it('stops on a page that adds no rows, even if more is claimed', async () => {
    const fetchMore = vi.fn(
      async (): Promise<FetchMoreResult> => ({ loaded: 100, hasMore: true }),
    )

    const result = await fetchUntil({
      target: Number.POSITIVE_INFINITY,
      loaded: 100,
      hasMore: true,
      fetchMore,
    })

    expect(fetchMore).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ loaded: 100, hasMore: true })
  })

  it('rejects when a page fails, after keeping the pages before it', async () => {
    const fetchMore = vi
      .fn<() => Promise<FetchMoreResult>>()
      .mockResolvedValueOnce({ loaded: 200, hasMore: true })
      .mockRejectedValueOnce(new Error('indexer unavailable'))

    await expect(
      fetchUntil({ target: 400, loaded: 100, hasMore: true, fetchMore }),
    ).rejects.toThrow('indexer unavailable')
    expect(fetchMore).toHaveBeenCalledTimes(2)
  })
})
