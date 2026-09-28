import { describe, expect, it, vi } from 'vitest'
import { createBignameClient } from './client'
import { BignameError, isStale } from './errors'

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const envelope = (data: unknown) => json({ data, meta: { as_of: {} } })

const apiError = (code: string, status: number) =>
  json({ error: { code, message: `${code} happened`, details: {} } }, status)

/** A client whose fetch replays the given responses in order. */
const clientWith = (...responses: Response[]) => {
  const fetch = vi.fn(async () => responses.shift() ?? json({}, 500))
  const client = createBignameClient('https://bigname.example/', {
    fetch: fetch as unknown as typeof globalThis.fetch,
  })
  return { client, fetch }
}

const requestOf = (fetch: ReturnType<typeof vi.fn>, call = 0) => {
  const [url, init] = fetch.mock.calls[call] as [string, RequestInit]
  return { url, init }
}

describe('createBignameClient', () => {
  describe('requests', () => {
    it('builds the path and sends only the defined query parameters', async () => {
      const { client, fetch } = clientWith(envelope([]))

      await client.addressNames('0xabc', {
        relation: 'any',
        page_size: 1,
        include: ['counts', 'role_summary'],
        cursor: undefined,
      })

      const { url, init } = requestOf(fetch)
      expect(url).toBe(
        'https://bigname.example/v1/addresses/0xabc/names?relation=any&page_size=1&include=counts%2Crole_summary',
      )
      expect(init.method).toBe('GET')
    })

    it('encodes the name in the path', async () => {
      const { client, fetch } = clientWith(envelope({}))

      await client.name('ünïcode.eth')

      expect(requestOf(fetch).url).toBe(
        'https://bigname.example/v1/names/%C3%BCn%C3%AFcode.eth',
      )
    })

    // The edge answers CORS preflight only for POST /v1/lookup. Any header on
    // a GET makes the browser preflight and the request fails.
    it('sends no headers on GET', async () => {
      const { client, fetch } = clientWith(envelope({}))

      await client.status()

      expect(requestOf(fetch).init.headers).toBeUndefined()
    })

    it('posts lookups as JSON', async () => {
      const { client, fetch } = clientWith(envelope([]))

      await client.lookup({ inputs: [{ name: 'a.eth' }], profile: 'feed' })

      const { url, init } = requestOf(fetch)
      expect(url).toBe('https://bigname.example/v1/lookup')
      expect(init.method).toBe('POST')
      expect(init.headers).toEqual({ 'content-type': 'application/json' })
      expect(JSON.parse(init.body as string)).toEqual({
        inputs: [{ name: 'a.eth' }],
        profile: 'feed',
      })
    })
  })

  describe('responses', () => {
    it('returns the envelope as an ok result', async () => {
      const { client } = clientWith(
        json({
          data: { status: 'ready' },
          meta: { as_of: { '11155111': { block_number: 1 } } },
        }),
      )

      const result = await client.status()

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap().data).toEqual({ status: 'ready' })
      expect(
        result._unsafeUnwrap().meta.as_of?.['11155111']?.block_number,
      ).toBe(1)
    })

    it.each([
      ['invalid_input', 400],
      ['not_found', 404],
      ['stale', 409],
      ['unsupported', 422],
      ['internal_error', 500],
    ])('maps a %s error body to a BignameError', async (code, status) => {
      const { client, fetch } = clientWith(apiError(code, status))

      const result = await client.name('a.eth')

      expect(result.isErr()).toBe(true)
      const error = result._unsafeUnwrapErr()
      expect(error).toBeInstanceOf(BignameError)
      expect(error.code).toBe(code)
      expect(error.status).toBe(status)
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('flags a stale cursor so a caller can restart from page one', async () => {
      const { client } = clientWith(apiError('stale', 409))

      const result = await client.subnames('a.eth', { cursor: 'old' })

      expect(isStale(result._unsafeUnwrapErr())).toBe(true)
    })

    it('reports a non-JSON error page as malformed rather than crashing', async () => {
      const { client } = clientWith(
        new Response('<html>502 Bad Gateway</html>', { status: 502 }),
      )

      const error = (await client.status())._unsafeUnwrapErr()

      expect(error.code).toBe('malformed_response')
      expect(error.status).toBe(502)
    })

    it('reports a 200 without a full envelope as malformed', async () => {
      const { client } = clientWith(json({ data: {} }))

      expect((await client.status())._unsafeUnwrapErr().code).toBe(
        'malformed_response',
      )
    })
  })

  // One call is one HTTP attempt. Retry belongs to the caller: TanStack Query
  // on the frontend, the job's own loop on the worker.
  describe('one attempt per call', () => {
    it.each([
      ['rate_limited', 429],
      ['overloaded', 503],
    ])('returns a %s error after a single request', async (code, status) => {
      const { client, fetch } = clientWith(apiError(code, status), envelope({}))

      const error = (await client.status())._unsafeUnwrapErr()

      expect(error.code).toBe(code)
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('reports a failed fetch as a network error', async () => {
      const fetch = vi.fn(async () => {
        throw new TypeError('fetch failed')
      })
      const client = createBignameClient('https://bigname.example', {
        fetch: fetch as unknown as typeof globalThis.fetch,
      })

      const error = (await client.status())._unsafeUnwrapErr()

      expect(error.code).toBe('network')
      expect(fetch).toHaveBeenCalledTimes(1)
    })
  })
})
