import { describe, expect, it, vi } from 'vitest'
import { createGraphqlTransport } from './graphql'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

const requestWith = (respond: () => Promise<Response>) =>
  createGraphqlTransport({
    url: 'https://graphql.example',
    fetch: vi.fn<typeof globalThis.fetch>(respond),
  })

describe('createGraphqlTransport', () => {
  it('posts the query and variables, and answers with `data`', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      json({ data: { domains: [] } }),
    )
    const request = createGraphqlTransport({
      url: 'https://graphql.example',
      fetch,
    })

    const result = await request('query Q { domains }', { first: 1 })

    expect(result._unsafeUnwrap()).toEqual({ domains: [] })
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe('https://graphql.example')
    expect(JSON.parse(String(init?.body))).toEqual({
      query: 'query Q { domains }',
      variables: { first: 1 },
    })
  })

  it.each([
    {
      case: 'GraphQL errors',
      respond: async () => json({ errors: [{ message: 'complexity' }] }),
      kind: 'rejected',
    },
    {
      case: 'a 400 without a body',
      respond: async () => new Response('bad', { status: 400 }),
      kind: 'rejected',
    },
    {
      case: 'a 503',
      respond: async () => json({ message: 'down' }, 503),
      kind: 'unavailable',
    },
    {
      case: 'a 429 with GraphQL errors',
      respond: async () => json({ errors: [{ message: 'slow down' }] }, 429),
      kind: 'unavailable',
    },
    {
      case: 'a network failure',
      respond: async () => Promise.reject(new TypeError('fetch failed')),
      kind: 'unavailable',
    },
  ])('treats $case as $kind', async ({ respond, kind }) => {
    const result = await requestWith(respond)('query Q { a }', {})

    expect(result._unsafeUnwrapErr().kind).toBe(kind)
  })
})
