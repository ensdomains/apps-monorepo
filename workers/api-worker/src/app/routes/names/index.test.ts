import { beforeEach, describe, expect, it, vi } from 'vitest'

// Queue of results returned by successive `select().from().where()` chains,
// in call order (stats route: favorites count first, search count second).
const selectResults: Array<Array<{ value: number }>> = []
const insertedValues: Array<Record<string, unknown>> = []

const mockDb = {
  select: vi.fn(() => {
    const result = selectResults.shift() ?? []
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => Promise.resolve(result)),
    }
    return chain
  }),
  insert: vi.fn(() => ({
    values: vi.fn((values: Record<string, unknown>) => {
      insertedValues.push(values)
      return {
        onConflictDoNothing: vi.fn(() => Promise.resolve()),
      }
    }),
  })),
}

vi.mock('#core/database/index.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('#core/database/index.js')>()
  return {
    ...actual,
    getDatabase: () => mockDb,
  }
})

import namesApp from './index'

const env = {
  JWT_SECRET: 'test-secret',
} as CloudflareBindings

beforeEach(() => {
  selectResults.length = 0
  insertedValues.length = 0
  vi.clearAllMocks()
})

describe('GET /names/:name/stats', () => {
  it('returns favorite and unique-search counts for the name', async () => {
    selectResults.push([{ value: 425 }], [{ value: 40 }])

    const res = await namesApp.request('/names/vitalik.eth/stats', {}, env)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      name: 'vitalik.eth',
      favorites: 425,
      unique_searches_last_30d: 40,
    })
  })

  it('returns zero counts when the name has no rows', async () => {
    selectResults.push([], [])

    const res = await namesApp.request('/names/unknown.eth/stats', {}, env)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      name: 'unknown.eth',
      favorites: 0,
      unique_searches_last_30d: 0,
    })
  })
})

describe('POST /names/:name/searches', () => {
  const request = (headers: Record<string, string>) =>
    namesApp.request(
      '/names/vitalik.eth/searches',
      { method: 'POST', headers },
      env,
    )

  it('records a search with a hashed searcher identity', async () => {
    const res = await request({
      'cf-connecting-ip': '203.0.113.7',
      'user-agent': 'test-agent',
    })

    expect(res.status).toBe(200)
    expect(insertedValues).toHaveLength(1)
    expect(insertedValues[0]?.name).toBe('vitalik.eth')
    // Salted SHA-256 hex digest — raw IP / user agent must not be stored
    expect(insertedValues[0]?.searcher_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(String(insertedValues[0]?.searcher_hash)).not.toContain(
      '203.0.113.7',
    )
  })

  it('hashes identical searchers to the same value and distinct ones apart', async () => {
    await request({ 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'ua' })
    await request({ 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'ua' })
    await request({ 'cf-connecting-ip': '198.51.100.9', 'user-agent': 'ua' })

    expect(insertedValues).toHaveLength(3)
    expect(insertedValues[0]?.searcher_hash).toBe(
      insertedValues[1]?.searcher_hash,
    )
    expect(insertedValues[0]?.searcher_hash).not.toBe(
      insertedValues[2]?.searcher_hash,
    )
  })
})
