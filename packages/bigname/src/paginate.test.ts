import { describe, expect, it } from 'vitest'
import { createBignameClient } from './client'
import { fetchAllPages, iteratePages } from './paginate'
import { errorResponse, jsonResponse, mockFetch, pageOf } from './testUtils'

const BASE = 'https://bigname.test'

const clientWith = (fetchMock: typeof fetch) =>
  createBignameClient({
    baseUrl: BASE,
    fetch: fetchMock,
    retry: { retries: 2, baseDelayMs: 0, maxDelayMs: 0 },
  })

const cursorOf = (url: string): string | null =>
  new URL(url).searchParams.get('cursor')

describe('fetchAllPages', () => {
  it('walks next_cursor until has_more is false', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, pageOf([{ name: 'a.eth' }, { name: 'b.eth' }], 'c1')),
      jsonResponse(200, pageOf([{ name: 'c.eth' }], 'c2', 'c1')),
      jsonResponse(200, pageOf([{ name: 'd.eth' }], null, 'c2')),
    )
    const client = clientWith(fetch)
    const result = await fetchAllPages((cursor) =>
      client.listAddressNames('0xabc', { page_size: 200, cursor }),
    )
    expect(result.rows.map((row) => row.name)).toEqual([
      'a.eth',
      'b.eth',
      'c.eth',
      'd.eth',
    ])
    expect(result.truncated).toBe(false)
    expect(calls.map((call) => cursorOf(call.url))).toEqual([null, 'c1', 'c2'])
  })

  it('restarts from the first page when a continuation answers 409 stale', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, pageOf([{ name: 'old-a.eth' }], 'c1')),
      errorResponse(409, 'stale', 'collection publication changed'),
      jsonResponse(200, pageOf([{ name: 'a.eth' }], 'd1')),
      jsonResponse(200, pageOf([{ name: 'b.eth' }], null, 'd1')),
    )
    const client = clientWith(fetch)
    const result = await fetchAllPages((cursor) =>
      client.listSubnames('eth', { cursor }),
    )
    expect(result.rows.map((row) => row.name)).toEqual(['a.eth', 'b.eth'])
    expect(calls.map((call) => cursorOf(call.url))).toEqual([
      null,
      'c1',
      null,
      'd1',
    ])
  })

  it('gives up after maxRestarts', async () => {
    const { fetch } = mockFetch(
      jsonResponse(200, pageOf([{ name: 'a.eth' }], 'c1')),
      errorResponse(409, 'stale'),
      jsonResponse(200, pageOf([{ name: 'a.eth' }], 'c2')),
      errorResponse(409, 'stale'),
    )
    const client = clientWith(fetch)
    await expect(
      fetchAllPages((cursor) => client.listSubnames('eth', { cursor }), {
        maxRestarts: 1,
      }),
    ).rejects.toMatchObject({ code: 'stale' })
  })

  it('does not restart on other errors', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, pageOf([{ name: 'a.eth' }], 'c1')),
      errorResponse(400, 'invalid_input'),
    )
    const client = clientWith(fetch)
    await expect(
      fetchAllPages((cursor) => client.listSubnames('eth', { cursor })),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(calls).toHaveLength(2)
  })

  it('stops at maxPages and reports truncation', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, pageOf([{ name: 'a.eth' }], 'c1')),
      jsonResponse(200, pageOf([{ name: 'b.eth' }], 'c2', 'c1')),
    )
    const client = clientWith(fetch)
    const result = await fetchAllPages(
      (cursor) => client.listSubnames('eth', { cursor }),
      { maxPages: 2 },
    )
    expect(result.rows).toHaveLength(2)
    expect(result.truncated).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('stops at maxRows and reports truncation', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, pageOf([{ name: 'a.eth' }, { name: 'b.eth' }], 'c1')),
    )
    const client = clientWith(fetch)
    const result = await fetchAllPages(
      (cursor) => client.listSubnames('eth', { cursor }),
      { maxRows: 1 },
    )
    expect(result.rows.map((row) => row.name)).toEqual(['a.eth'])
    expect(result.truncated).toBe(true)
    expect(calls).toHaveLength(1)
  })
})

describe('iteratePages', () => {
  it('flags the first page after a restart', async () => {
    const { fetch } = mockFetch(
      jsonResponse(200, pageOf([1], 'c1')),
      errorResponse(409, 'stale'),
      jsonResponse(200, pageOf([2], null)),
    )
    const client = clientWith(fetch)
    const steps: { data: readonly unknown[]; restarted: boolean }[] = []
    for await (const step of iteratePages((cursor) =>
      client.listPermissions({ address: '0xabc', cursor }),
    )) {
      steps.push({ data: step.data, restarted: step.restarted })
    }
    expect(steps).toEqual([
      { data: [1], restarted: false },
      { data: [2], restarted: true },
    ])
  })

  it('honours an aborted signal between pages', async () => {
    const controller = new AbortController()
    const { fetch } = mockFetch(jsonResponse(200, pageOf([1], 'c1')))
    const client = clientWith(fetch)
    const pages = iteratePages(
      (cursor) => client.listSubnames('eth', { cursor }),
      { signal: controller.signal },
    )
    await pages.next()
    controller.abort()
    await expect(pages.next()).rejects.toThrow()
  })
})
