import { describe, expect, it } from 'vitest'
import { createBignameClient } from './client'
import { BignameError, isBignameError } from './errors'
import { errorResponse, jsonResponse, mockFetch, pageOf } from './testUtils'

const BASE = 'https://bigname.test'

const clientWith = (fetchMock: typeof fetch) =>
  createBignameClient({
    baseUrl: BASE,
    fetch: fetchMock,
    retry: { retries: 3, baseDelayMs: 0, maxDelayMs: 0 },
  })

const nameDetail = {
  name: 'nick.eth',
  display_name: 'nick.eth',
  namespace: 'ens',
  namehash: '0x05a6',
  status: 'ok',
  authority: 'ens_v1',
}

describe('envelope', () => {
  it('returns data and meta from a single-resource read', async () => {
    const meta = {
      as_of: {
        '11155111': {
          block_number: 1,
          block_hash: '0xabc',
          timestamp: '2026-09-28T07:12:00Z',
        },
      },
      as_of_token: 'tok',
    }
    const { fetch, calls } = mockFetch(
      jsonResponse(200, { data: nameDetail, meta }),
    )
    const response = await clientWith(fetch).getName('nick.eth')
    expect(response?.data).toEqual(nameDetail)
    expect(response?.meta.as_of?.['11155111']?.block_number).toBe(1)
    expect(calls[0]?.url).toBe(`${BASE}/v1/names/nick.eth`)
    expect(calls[0]?.init?.method).toBe('GET')
  })

  it('returns data, page and meta from a collection', async () => {
    const { fetch } = mockFetch(
      jsonResponse(200, pageOf([{ name: 'a.eth' }], 'next')),
    )
    const response = await clientWith(fetch).listAddressNames('0xabc')
    expect(response.data).toEqual([{ name: 'a.eth' }])
    expect(response.page.next_cursor).toBe('next')
    expect(response.page.has_more).toBe(true)
  })

  it('rejects a success body without a data envelope', async () => {
    const { fetch } = mockFetch(jsonResponse(200, { nope: true }))
    await expect(clientWith(fetch).getStatus()).rejects.toMatchObject({
      code: 'internal_error',
    })
  })

  it('strips a trailing slash from the base URL', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, { data: {}, meta: {} }),
    )
    await createBignameClient({ baseUrl: `${BASE}/`, fetch }).getStatus()
    expect(calls[0]?.url).toBe(`${BASE}/v1/status`)
  })
})

describe('errors', () => {
  it('maps the error envelope onto BignameError', async () => {
    const { fetch } = mockFetch(
      jsonResponse(400, {
        error: {
          code: 'invalid_input',
          message: 'unknown query parameter: bogus',
          details: { parameter: 'bogus' },
        },
      }),
    )
    const error = await clientWith(fetch)
      .getStatus()
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BignameError)
    expect(error).toMatchObject({
      status: 400,
      code: 'invalid_input',
      message: 'unknown query parameter: bogus',
      details: { parameter: 'bogus' },
    })
    expect(isBignameError(error, 'invalid_input')).toBe(true)
  })

  it('maps 422 to unsupported', async () => {
    const { fetch } = mockFetch(errorResponse(422, 'unsupported'))
    await expect(
      clientWith(fetch).listAddressNames('0xabc', {
        include: ['role_summary'],
      }),
    ).rejects.toMatchObject({ status: 422, code: 'unsupported' })
  })

  it('falls back to a status-derived code for a non-JSON error body', async () => {
    const { fetch } = mockFetch(
      new Response('<html>bad</html>', { status: 404 }),
    )
    await expect(clientWith(fetch).getStatus()).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
  })

  it('wraps network failures with status 0 after retrying', async () => {
    const failure = () => Promise.reject(new TypeError('fetch failed'))
    const { fetch, calls } = mockFetch(failure, failure, failure, failure)
    await expect(clientWith(fetch).getStatus()).rejects.toMatchObject({
      status: 0,
      code: 'internal_error',
    })
    expect(calls).toHaveLength(4)
  })

  it('does not retry or wrap an aborted request', async () => {
    const controller = new AbortController()
    controller.abort()
    const abortError = new DOMException('aborted', 'AbortError')
    const { fetch, calls } = mockFetch(() => Promise.reject(abortError))
    await expect(
      clientWith(fetch).getStatus({ signal: controller.signal }),
    ).rejects.toBe(abortError)
    expect(calls).toHaveLength(1)
  })
})

describe('404 → null', () => {
  it('getName resolves null for not_found', async () => {
    const { fetch } = mockFetch(errorResponse(404, 'not_found'))
    await expect(clientWith(fetch).getName('missing.eth')).resolves.toBeNull()
  })

  it('getNameRecords, getRegistry and getResolver resolve null for not_found', async () => {
    const { fetch } = mockFetch(
      errorResponse(404, 'not_found'),
      errorResponse(404, 'not_found'),
      errorResponse(404, 'not_found'),
    )
    const client = clientWith(fetch)
    await expect(client.getNameRecords('missing.eth')).resolves.toBeNull()
    await expect(client.getRegistry(11155111, '0xabc')).resolves.toBeNull()
    await expect(client.getResolver(11155111, '0xabc')).resolves.toBeNull()
  })

  it('getName still rejects other errors', async () => {
    const { fetch } = mockFetch(errorResponse(400, 'invalid_input'))
    await expect(clientWith(fetch).getName('BAD')).rejects.toMatchObject({
      code: 'invalid_input',
    })
  })

  it('collections reject not_found', async () => {
    const { fetch } = mockFetch(errorResponse(404, 'not_found'))
    await expect(
      clientWith(fetch).listSubnames('missing.eth'),
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('retry', () => {
  it.each([
    [429, 'rate_limited'],
    [503, 'overloaded'],
    [408, 'request_timeout'],
  ])('retries %i then succeeds', async (status, code) => {
    const { fetch, calls } = mockFetch(
      errorResponse(status, code),
      jsonResponse(200, { data: { status: 'ready' }, meta: {} }),
    )
    const response = await clientWith(fetch).getStatus()
    expect(response.data).toEqual({ status: 'ready' })
    expect(calls).toHaveLength(2)
  })

  it('gives up after the configured number of retries', async () => {
    const { fetch, calls } = mockFetch(
      errorResponse(503, 'overloaded'),
      errorResponse(503, 'overloaded'),
    )
    const client = createBignameClient({
      baseUrl: BASE,
      fetch,
      retry: { retries: 1, baseDelayMs: 0, maxDelayMs: 0 },
    })
    await expect(client.getStatus()).rejects.toMatchObject({
      code: 'overloaded',
    })
    expect(calls).toHaveLength(2)
  })

  it('does not retry client errors', async () => {
    const { fetch, calls } = mockFetch(errorResponse(400, 'invalid_input'))
    await expect(clientWith(fetch).getStatus()).rejects.toBeInstanceOf(
      BignameError,
    )
    expect(calls).toHaveLength(1)
  })

  it('retry: false disables retries', async () => {
    const { fetch, calls } = mockFetch(errorResponse(429, 'rate_limited'))
    const client = createBignameClient({ baseUrl: BASE, fetch, retry: false })
    await expect(client.getStatus()).rejects.toMatchObject({
      code: 'rate_limited',
    })
    expect(calls).toHaveLength(1)
  })

  it('retries 409 stale on a single-resource read', async () => {
    const { fetch, calls } = mockFetch(
      errorResponse(
        409,
        'stale',
        'requested snapshot is not available for name',
      ),
      jsonResponse(200, { data: nameDetail, meta: {} }),
    )
    const response = await clientWith(fetch).getName('nick.eth')
    expect(response?.data.name).toBe('nick.eth')
    expect(calls).toHaveLength(2)
  })

  it('retries 409 stale on a first page', async () => {
    const { fetch, calls } = mockFetch(
      errorResponse(
        409,
        'stale',
        'collection publication changed during the read',
      ),
      jsonResponse(200, pageOf([], null)),
    )
    await clientWith(fetch).listSubnames('eth')
    expect(calls).toHaveLength(2)
  })

  it('retries 409 stale on a history continuation (cursor survives publications)', async () => {
    const { fetch, calls } = mockFetch(
      errorResponse(409, 'stale'),
      jsonResponse(200, pageOf([], null, 'c1')),
    )
    await clientWith(fetch).getNameHistory('nick.eth', { cursor: 'c1' })
    expect(calls).toHaveLength(2)
    expect(calls[1]?.url).toContain('cursor=c1')
  })

  it('does not retry 409 stale on a current-state continuation', async () => {
    const { fetch, calls } = mockFetch(errorResponse(409, 'stale'))
    await expect(
      clientWith(fetch).listAddressNames('0xabc', { cursor: 'c1' }),
    ).rejects.toMatchObject({ code: 'stale' })
    expect(calls).toHaveLength(1)
  })

  it('does not retry 409 conflict', async () => {
    const { fetch, calls } = mockFetch(errorResponse(409, 'conflict'))
    await expect(clientWith(fetch).getName('nick.eth')).rejects.toMatchObject({
      code: 'conflict',
    })
    expect(calls).toHaveLength(1)
  })
})

describe('request building', () => {
  it('encodes path segments and query params', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, pageOf([], null)),
      jsonResponse(200, pageOf([], null)),
    )
    const client = clientWith(fetch)
    await client.getNameHistory('ñandú.eth', {
      type: ['registration', 'renewal'],
      include: ['data', 'raw'],
      from_timestamp: '2025-06-15T17:37:42+02:30',
      page_size: 100,
    })
    expect(calls[0]?.url).toBe(
      `${BASE}/v1/names/%C3%B1and%C3%BA.eth/history?type=registration%2Crenewal&include=data%2Craw&from_timestamp=2025-06-15T17%3A37%3A42%2B02%3A30&page_size=100`,
    )
    await client.listAddressNames('0xAbC', {
      relation: 'resolves_to',
      coin_type: 'evm',
      is_migrated: false,
      q: undefined,
    })
    expect(calls[1]?.url).toBe(
      `${BASE}/v1/addresses/0xAbC/names?relation=resolves_to&coin_type=evm&is_migrated=false`,
    )
  })

  it('serializes Date params and the events resolver filter', async () => {
    const { fetch, calls } = mockFetch(jsonResponse(200, pageOf([], null)))
    await clientWith(fetch).listEvents({
      resolver: { chain_id: 11155111, address: '0xabc' },
      to_timestamp: new Date('2026-01-01T00:00:00Z'),
    })
    expect(calls[0]?.url).toBe(
      `${BASE}/v1/events?resolver=11155111%3A0xabc&to_timestamp=2026-01-01T00%3A00%3A00.000Z`,
    )
  })

  it('posts lookup with a JSON body and comma-joined include', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, { data: [], meta: {} }),
    )
    await clientWith(fetch).lookup({
      inputs: [{ id: 'a', name: 'nick.eth' }],
      profile: 'detail',
      include: ['inventory'],
    })
    expect(calls[0]?.url).toBe(`${BASE}/v1/lookup`)
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      inputs: [{ id: 'a', name: 'nick.eth' }],
      profile: 'detail',
      include: 'inventory',
    })
  })
})

describe('configuration', () => {
  it('uses the configured base URL', () => {
    const client = createBignameClient({ baseUrl: BASE })
    expect(client.baseUrl).toBe(BASE)
  })

  it.each(['', '   '])('throws on a blank base URL (%o)', (baseUrl) => {
    expect(() => createBignameClient({ baseUrl })).toThrow(/no base URL/)
  })
})
