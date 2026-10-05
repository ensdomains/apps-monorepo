import { mockAddressNamesAboveCountCap } from '@ens-apps/bigname/postV041.mock'
import { mockAddressNameRoleHolder } from '@ens-apps/bigname/v041.mock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EXACT_COUNT_TIMEOUT_MS,
  getAddressNamesCount,
} from './addressNamesCount'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/bigname', async () => {
  const { createBignameClient } = await import('@ens-apps/bigname')
  return {
    bigname: createBignameClient({
      baseUrl: 'https://bigname.test',
      fetch: fetchMock,
      retry: false,
    }),
  }
})

const ADDRESS = '0x03ba34f6ea1496fa316873cf8350a3f7ead317ef'
const PARAMS = {
  relation: 'owner',
  parent: 'eth',
  dedupe: 'registration',
} as const

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const error = (status: number, code: string, message: string): Response =>
  json({ error: { code, message, details: {} } }, status)

/** A one-row page as bigname v0.4.1 serves it: always counted. */
const countedPage = (totalCount: number) => ({
  data: totalCount === 0 ? [] : [mockAddressNameRoleHolder],
  page: {
    cursor: null,
    next_cursor: totalCount > 1 ? 'eyJzIjoibmFtZSJ9' : null,
    page_size: 1,
    total_count: totalCount,
    has_more: totalCount > 1,
  },
  meta: mockAddressNamesAboveCountCap.meta,
})

/** The 400 bigname v0.4.1 answers for `include=total_count`. */
const v041IncludeRejection = () =>
  error(
    400,
    'invalid_input',
    'include must contain only role_summary or counts',
  )

const queries = () =>
  fetchMock.mock.calls.map(([url]) =>
    Object.fromEntries(new URL(String(url)).searchParams),
  )

beforeEach(() => {
  fetchMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getAddressNamesCount', () => {
  describe('bigname v0.4.1 (always counts, rejects include=total_count)', () => {
    it('reads the exact count from one row and never sends the flag', async () => {
      fetchMock.mockImplementation(async (url: string) =>
        new URL(url).searchParams.has('include')
          ? v041IncludeRejection()
          : json(countedPage(11)),
      )

      await expect(getAddressNamesCount(ADDRESS, PARAMS)).resolves.toBe(11)
      expect(queries()).toEqual([
        {
          relation: 'owner',
          parent: 'eth',
          dedupe: 'registration',
          page_size: '1',
        },
      ])
    })

    it('reads a count of zero', async () => {
      fetchMock.mockResolvedValueOnce(json(countedPage(0)))

      await expect(getAddressNamesCount(ADDRESS, PARAMS)).resolves.toBe(0)
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('reads an uncounted page it cannot recount as unknown', async () => {
      fetchMock
        .mockResolvedValueOnce(json(mockAddressNamesAboveCountCap))
        .mockResolvedValueOnce(v041IncludeRejection())

      await expect(getAddressNamesCount(ADDRESS, PARAMS)).resolves.toBeNull()
    })
  })

  describe('after bigname v0.4.1 (null above 1,000 candidate names)', () => {
    it('reads a count bigname gives without the flag', async () => {
      fetchMock.mockResolvedValueOnce(json(countedPage(3)))

      await expect(getAddressNamesCount(ADDRESS, PARAMS)).resolves.toBe(3)
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('asks again with include=total_count on the first page when the count is null', async () => {
      fetchMock
        .mockResolvedValueOnce(json(mockAddressNamesAboveCountCap))
        .mockResolvedValueOnce(json(countedPage(1234)))

      await expect(getAddressNamesCount(ADDRESS, PARAMS)).resolves.toBe(1234)
      const first = {
        relation: 'owner',
        parent: 'eth',
        dedupe: 'registration',
        page_size: '1',
      }
      expect(queries()).toEqual([first, { ...first, include: 'total_count' }])
    })

    it('reads an empty uncounted page as zero without asking again', async () => {
      fetchMock.mockResolvedValueOnce(
        json({
          ...mockAddressNamesAboveCountCap,
          data: [],
          page: {
            ...mockAddressNamesAboveCountCap.page,
            next_cursor: null,
            has_more: false,
          },
        }),
      )

      await expect(getAddressNamesCount(ADDRESS, PARAMS)).resolves.toBe(0)
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('reads an exact count that reaches the bigname deadline (408) as unknown', async () => {
      fetchMock
        .mockResolvedValueOnce(json(mockAddressNamesAboveCountCap))
        .mockResolvedValueOnce(
          error(408, 'request_timeout', 'request deadline exceeded'),
        )

      await expect(getAddressNamesCount(ADDRESS, PARAMS)).resolves.toBeNull()
    })

    it('stops waiting for the exact count after its own deadline and aborts the read', async () => {
      vi.useFakeTimers()
      let exactSignal: AbortSignal | undefined
      fetchMock
        .mockResolvedValueOnce(json(mockAddressNamesAboveCountCap))
        .mockImplementationOnce(
          (_url: string, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              exactSignal = init?.signal ?? undefined
              exactSignal?.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError')),
              )
            }),
        )

      const count = getAddressNamesCount(ADDRESS, PARAMS)
      await vi.advanceTimersByTimeAsync(EXACT_COUNT_TIMEOUT_MS)

      await expect(count).resolves.toBeNull()
      expect(exactSignal?.aborted).toBe(true)
    })

    it('rejects when the exact count fails for another reason', async () => {
      fetchMock
        .mockResolvedValueOnce(json(mockAddressNamesAboveCountCap))
        .mockResolvedValueOnce(error(500, 'internal_error', 'boom'))

      await expect(getAddressNamesCount(ADDRESS, PARAMS)).rejects.toMatchObject(
        { code: 'internal_error' },
      )
    })
  })

  it('rejects when the first read fails', async () => {
    fetchMock.mockResolvedValueOnce(error(503, 'overloaded', 'busy'))

    await expect(getAddressNamesCount(ADDRESS, PARAMS)).rejects.toMatchObject({
      code: 'overloaded',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
