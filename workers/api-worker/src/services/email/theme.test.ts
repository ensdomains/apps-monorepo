import { createBignameClient } from '@ens-apps/indexer/bigname'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_THEME_COLOR,
  readThemeRecord,
  resolveThemeColor,
} from './theme.js'

const clientReturning = (response: Response | Error) => {
  const fetch = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  return {
    fetch,
    client: createBignameClient('https://bigname.example', {
      fetch: fetch as unknown as typeof globalThis.fetch,
    }),
  }
}

const recordsResponse = (records: Record<string, unknown>) =>
  new Response(
    JSON.stringify({
      data: { namespace: 'ens', resolver: null, records },
      meta: { as_of: {} },
    }),
    { headers: { 'content-type': 'application/json' } },
  )

describe('resolveThemeColor', () => {
  it.each([
    ['#E72A96', '#E72A96'],
    [' #e72a96 ', '#E72A96'],
    // The app's aliases for the same themes.
    ['#0080BC', '#0082BB'],
    ['#000000', '#02293B'],
  ])('maps %s to %s', (record, color) => {
    expect(resolveThemeColor(record)).toBe(color)
  })

  it.each([null, '', '#123456', 'red', 'url(x)'])(
    'falls back to the default for %s',
    (record) => {
      expect(resolveThemeColor(record)).toBe(DEFAULT_THEME_COLOR)
    },
  )
})

describe('readThemeRecord', () => {
  it('asks for the theme text record only', async () => {
    const { client, fetch } = clientReturning(
      recordsResponse({ 'text:theme': { status: 'ok', value: '#E72A96' } }),
    )
    await expect(readThemeRecord(client, 'alice.eth')).resolves.toBe('#E72A96')
    const [url] = fetch.mock.calls[0] as unknown as [string]
    expect(url).toContain('/v1/names/alice.eth/records')
    expect(url).toContain('text%3Atheme')
  })

  it('returns null when the record is not set', async () => {
    const { client } = clientReturning(
      recordsResponse({ 'text:theme': { status: 'not_found' } }),
    )
    await expect(readThemeRecord(client, 'alice.eth')).resolves.toBeNull()
  })

  it.each([
    ['no data', { data: null, meta: {} }],
    ['no records', { data: {}, meta: {} }],
    [
      'a non-string value',
      {
        data: { records: { 'text:theme': { status: 'ok', value: 42 } } },
        meta: {},
      },
    ],
  ])('returns null for a malformed response with %s', async (_case, body) => {
    const { client } = clientReturning(
      new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(readThemeRecord(client, 'alice.eth')).resolves.toBeNull()
  })

  it('returns null instead of failing when the indexer is down', async () => {
    const { client } = clientReturning(new Error('connection refused'))
    await expect(readThemeRecord(client, 'alice.eth')).resolves.toBeNull()
  })
})
