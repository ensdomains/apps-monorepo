import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetRecords = vi.fn()

vi.mock('@ensdomains/ensjs/public', () => ({
  getRecords: (...args: unknown[]) => mockGetRecords(...args),
}))

vi.mock('@/lib/wagmi', () => ({
  publicClient: {},
}))

const { fetchNameOgCard } = await import('./nameCardData')

const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const CHUNK_BYTES = 64 * 1024

/**
 * A response body delivered lazily, in chunks.
 *
 * `pull` rather than a pre-filled `start`, with `highWaterMark: 0` so the stream
 * reads ahead by nothing: `pulled` is then exactly what the consumer asked for,
 * which is what makes the memory bound observable rather than merely checking
 * that an oversized avatar gets dropped.
 */
function chunkedBody(totalBytes: number) {
  const state = { cancelled: false, pulled: 0 }

  const stream = new ReadableStream<Uint8Array>(
    {
      cancel() {
        state.cancelled = true
      },
      pull(controller) {
        const remaining = totalBytes - state.pulled
        if (remaining <= 0) {
          controller.close()
          return
        }

        const size = Math.min(CHUNK_BYTES, remaining)
        state.pulled += size
        controller.enqueue(new Uint8Array(size))
      },
    },
    { highWaterMark: 0 },
  )

  return { state, stream }
}

/** An avatar response, omitting `content-length` unless asked for one. */
function avatarResponse(
  stream: ReadableStream<Uint8Array>,
  declaredLength?: number,
) {
  const headers = new Headers({ 'content-type': 'image/png' })
  if (declaredLength !== undefined) {
    headers.set('content-length', String(declaredLength))
  }

  return new Response(stream, { headers })
}

describe('fetchNameOgCard avatar cap', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGetRecords.mockResolvedValue({
      texts: [{ key: 'avatar', value: 'https://example.test/a.png' }],
    })
  })

  it('embeds an avatar that fits under the cap', async () => {
    const { state, stream } = chunkedBody(4 * 1024)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(avatarResponse(stream))

    const card = await fetchNameOgCard('test.eth')

    expect(card.avatar).toMatch(/^data:image\/png;base64,/)
    expect(state.pulled).toBe(4 * 1024)
  })

  it('drops an oversized avatar that never declares its length', async () => {
    const oversized = AVATAR_MAX_BYTES * 4
    const { state, stream } = chunkedBody(oversized)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(avatarResponse(stream))

    const card = await fetchNameOgCard('test.eth')

    expect(card.avatar).toBeNull()
    // The point of the fix: the body is abandoned at the cap rather than being
    // allocated in full and rejected afterwards.
    expect(state.pulled).toBeLessThanOrEqual(AVATAR_MAX_BYTES + CHUNK_BYTES)
    expect(state.pulled).toBeLessThan(oversized)
    expect(state.cancelled).toBe(true)
  })

  it('rejects a declared oversized length without reading the body', async () => {
    const { state, stream } = chunkedBody(AVATAR_MAX_BYTES * 4)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      avatarResponse(stream, AVATAR_MAX_BYTES + 1),
    )

    const card = await fetchNameOgCard('test.eth')

    expect(card.avatar).toBeNull()
    expect(state.pulled).toBe(0)
  })

  it('still returns a themed card when the avatar fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('upstream down'))
    mockGetRecords.mockResolvedValue({
      texts: [
        { key: 'avatar', value: 'https://example.test/a.png' },
        { key: 'theme', value: '#E72A96' },
      ],
    })

    const card = await fetchNameOgCard('test.eth')

    expect(card).toEqual({
      avatar: null,
      name: 'test.eth',
      themeColor: '#E72A96',
    })
  })

  it('reads no coin records, since the card never shows an address', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('upstream down'))

    await fetchNameOgCard('test.eth')

    expect(mockGetRecords).toHaveBeenCalledWith(expect.anything(), {
      name: 'test.eth',
      texts: ['avatar', 'theme'],
    })
  })
})
