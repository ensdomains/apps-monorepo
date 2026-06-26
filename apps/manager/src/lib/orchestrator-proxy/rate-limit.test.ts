import { getAddress } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { reserveSponsorship, SPONSOR_RATE_LIMIT } from './rate-limit'

const ACCOUNT = getAddress('0x8c2e866b439358c41ae05de9cbe8a00bfefaffca')

/**
 * Minimal in-memory KVNamespace stub covering the `list`/`put` surface the
 * limiter uses. Keys never expire here — tests control the window by reusing a
 * fresh stub per case.
 */
function makeKV() {
  const store = new Map<string, string>()
  return {
    store,
    list: vi.fn(async ({ prefix }: { prefix: string }) => ({
      keys: [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name })),
      list_complete: true,
      cacheStatus: null,
    })),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
  } as unknown as KVNamespace & { store: Map<string, string> }
}

describe('reserveSponsorship', () => {
  it('allows requests under the limit and records a slot each time', async () => {
    const kv = makeKV()
    const r1 = await reserveSponsorship(kv, ACCOUNT)
    const r2 = await reserveSponsorship(kv, ACCOUNT)

    expect(r1.allowed).toBe(true)
    expect(r1.count).toBe(1)
    expect(r2.allowed).toBe(true)
    expect(r2.count).toBe(2)
    expect((kv as unknown as { store: Map<string, string> }).store.size).toBe(2)
  })

  it('blocks once the limit is reached and does not record a new slot', async () => {
    const kv = makeKV()
    for (let i = 0; i < SPONSOR_RATE_LIMIT; i++) {
      await reserveSponsorship(kv, ACCOUNT)
    }
    const store = (kv as unknown as { store: Map<string, string> }).store
    expect(store.size).toBe(SPONSOR_RATE_LIMIT)

    const blocked = await reserveSponsorship(kv, ACCOUNT)
    expect(blocked.allowed).toBe(false)
    expect(blocked.count).toBe(SPONSOR_RATE_LIMIT)
    // No extra slot written when blocked.
    expect(store.size).toBe(SPONSOR_RATE_LIMIT)
  })

  it('writes 60s-expiring keys under a per-account prefix', async () => {
    const kv = makeKV()
    await reserveSponsorship(kv, ACCOUNT)

    expect(kv.put).toHaveBeenCalledWith(
      expect.stringContaining(`ratelimit:sponsor:${ACCOUNT}:`),
      '',
      { expirationTtl: 60 },
    )
  })

  it('scopes the count per account', async () => {
    const kv = makeKV()
    const other = getAddress('0x000000000000000000000000000000000000dEaD')
    await reserveSponsorship(kv, ACCOUNT)
    const r = await reserveSponsorship(kv, other)
    // Other account starts fresh despite ACCOUNT having a slot.
    expect(r.count).toBe(1)
  })

  it('fails open when KV throws', async () => {
    const kv = {
      list: vi.fn(async () => {
        throw new Error('kv down')
      }),
      put: vi.fn(),
    } as unknown as KVNamespace
    const r = await reserveSponsorship(kv, ACCOUNT)
    expect(r.allowed).toBe(true)
  })
})
