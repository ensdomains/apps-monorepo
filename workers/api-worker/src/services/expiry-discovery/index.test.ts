import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./indexer.js', () => ({
  fetchExpiringNamesPage: vi.fn(),
}))

import { runExpiryDiscoveryCron } from './index.js'
import { fetchExpiringNamesPage } from './indexer.js'

class MockKV {
  private store = new Map<string, string>()

  async get(key: string, type?: 'json') {
    const raw = this.store.get(key)
    if (!raw) return null
    if (type === 'json') return JSON.parse(raw)
    return raw
  }

  async put(key: string, value: string) {
    this.store.set(key, value)
  }
}

type CursorState = Record<string, { expiry_timestamp: number }>

describe('runExpiryDiscoveryCron', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-11T12:00:00Z'))
  })

  it('enqueues events and persists stage cursors', async () => {
    const sendBatch = vi.fn(async (_messages: Array<{ body: unknown }>) => undefined)
    vi.mocked(fetchExpiringNamesPage).mockImplementation(({ stage, cursor }) => {
      if (stage.id === '30d') {
        return okAsync({
          domains: [
            { name: 'alpha.eth', expiryDate: cursor + 100, owner: '0xabc' },
          ],
          hasMore: false,
        })
      }

      return okAsync({ domains: [], hasMore: false })
    })

    const env = {
      KV: new MockKV(),
      EVENT_INGESTION_QUEUE: { sendBatch },
    } as unknown as CloudflareBindings

    const result = await runExpiryDiscoveryCron(env)

    expect(result.isOk()).toBe(true)
    expect(sendBatch).toHaveBeenCalledTimes(1)

    const firstBatch = sendBatch.mock.calls[0]?.[0] as
      | Array<{ body: { includeFavorites: boolean; stage: string } }>
      | undefined
    expect(firstBatch).toBeDefined()
    if (!firstBatch) {
      throw new Error('Expected first batch to be defined')
    }

    expect(firstBatch[0].body.includeFavorites).toBe(false)
    expect(firstBatch[0].body.stage).toBe('30d')

    const cursors = (await env.KV.get(
      'notification_cursors',
      'json',
    )) as CursorState
    expect(cursors['30d'].expiry_timestamp).toBeGreaterThan(cursors['7d'].expiry_timestamp)
  })

  it('commits successful stages when one stage fails', async () => {
    const sendBatch = vi.fn(async (_messages: Array<{ body: unknown }>) => undefined)

    vi.mocked(fetchExpiringNamesPage).mockImplementation(({ stage, cursor }) => {
      if (stage.id === '7d') {
        return errAsync(new Error('indexer failed') as never)
      }

      if (stage.id === '1d') {
        return okAsync({
          domains: [{ name: 'beta.eth', expiryDate: cursor + 50, owner: '0xdef' }],
          hasMore: false,
        })
      }

      return okAsync({ domains: [], hasMore: false })
    })

    const env = {
      KV: new MockKV(),
      EVENT_INGESTION_QUEUE: { sendBatch },
    } as unknown as CloudflareBindings

    const result = await runExpiryDiscoveryCron(env)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().failedStages).toBe(1)

    const cursors = (await env.KV.get(
      'notification_cursors',
      'json',
    )) as CursorState
    const nowSec = Math.floor(new Date('2026-02-11T12:00:00Z').getTime() / 1000)

    expect(cursors['1d'].expiry_timestamp).toBe(nowSec + 50)
    expect(cursors['7d'].expiry_timestamp).toBe(nowSec)
  })
})
