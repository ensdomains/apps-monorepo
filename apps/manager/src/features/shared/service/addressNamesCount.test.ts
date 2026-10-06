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

const countedPage = (totalCount: number | null) => ({
  data: totalCount === 0 ? [] : [mockAddressNameRoleHolder],
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 1,
    total_count: totalCount,
    has_more: false,
  },
  meta: mockAddressNamesAboveCountCap.meta,
})

beforeEach(() => {
  fetchMock.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('getAddressNamesCount', () => {
  it.each([
    0,
    3,
    1234,
    null,
  ])('requests the exact count directly, including above the automatic count cap: %s', async (count) => {
    fetchMock.mockResolvedValueOnce(json(countedPage(count)))
    await expect(getAddressNamesCount(ADDRESS, PARAMS)).resolves.toBe(count)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(
      Object.fromEntries(
        new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams,
      ),
    ).toEqual({
      relation: 'owner',
      parent: 'eth',
      dedupe: 'registration',
      page_size: '1',
      include: 'total_count',
    })
  })
  it('keeps a backend deadline as an unknown count', async () => {
    fetchMock.mockResolvedValueOnce(
      error(408, 'request_timeout', 'request deadline exceeded'),
    )
    await expect(getAddressNamesCount(ADDRESS, PARAMS)).resolves.toBeNull()
  })
  it('aborts a count after its own deadline', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    const count = getAddressNamesCount(ADDRESS, PARAMS)
    await vi.advanceTimersByTimeAsync(EXACT_COUNT_TIMEOUT_MS)
    await expect(count).resolves.toBeNull()
    expect(signal?.aborted).toBe(true)
  })
  it.each([
    [400, 'invalid_input', 'include must contain only role_summary or counts'],
    [500, 'internal_error', 'boom'],
  ])('surfaces an error instead of trying an older contract: %s', async (status, code, message) => {
    fetchMock.mockResolvedValueOnce(error(status, code, message))
    await expect(getAddressNamesCount(ADDRESS, PARAMS)).rejects.toMatchObject({
      code,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
