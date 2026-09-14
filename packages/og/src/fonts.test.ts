import { describe, expect, it, vi } from 'vitest'
import { createOgFontCache, isSupportedSfnt } from './fonts'

const TRUETYPE = 0x00010000
const CFF = 0x4f54544f
const COLLECTION = 0x74746366
const WOFF2 = 0x774f4632

/** An 8-byte buffer carrying the given 4-byte sfnt signature. */
const sfnt = (signature: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(8)
  new DataView(buffer).setUint32(0, signature, false)

  return buffer
}

const fontResponse = (signature: number): Response =>
  new Response(sfnt(signature))

describe('isSupportedSfnt', () => {
  it('accepts the signatures satori can parse', () => {
    for (const signature of [TRUETYPE, CFF, COLLECTION]) {
      expect(isSupportedSfnt(sfnt(signature))).toBe(true)
    }
  })

  it('rejects woff2, which satori cannot read', () => {
    expect(isSupportedSfnt(sfnt(WOFF2))).toBe(false)
  })

  it('rejects a buffer too short to carry a signature', () => {
    expect(isSupportedSfnt(new ArrayBuffer(2))).toBe(false)
  })
})

describe('createOgFontCache', () => {
  it('resolves the first candidate that parses as a font', async () => {
    const load = createOgFontCache()

    expect(
      await load(['/font.ttf', '/client/font.ttf'], async (path) =>
        path === '/client/font.ttf' ? fontResponse(TRUETYPE) : null,
      ),
    ).not.toBeNull()
  })

  it('falls through a path answering with something that is not a font', async () => {
    // A worker serving a SPA answers a missing asset with index.html and a 200,
    // so a candidate can be "fetched" and still be unusable.
    const fetchFont = vi.fn(async (path: string) =>
      path === '/font.ttf'
        ? new Response('<!doctype html>')
        : fontResponse(TRUETYPE),
    )

    expect(
      await createOgFontCache()(['/font.ttf', '/client/font.ttf'], fetchFont),
    ).not.toBeNull()
    expect(fetchFont).toHaveBeenCalledTimes(2)
  })

  it('reports null when no candidate yields a font', async () => {
    const load = createOgFontCache()

    expect(
      await load(
        ['/font.ttf'],
        async () => new Response(null, { status: 404 }),
      ),
    ).toBeNull()
  })

  it('survives a fetcher that throws', async () => {
    const load = createOgFontCache()

    expect(
      await load(['/font.ttf'], async () => {
        throw new Error('network')
      }),
    ).toBeNull()
  })

  it('fetches a given path once, sharing the in-flight promise', async () => {
    const fetchFont = vi.fn(async () => fontResponse(TRUETYPE))
    const load = createOgFontCache()

    const [first, second] = await Promise.all([
      load(['/font.ttf'], fetchFont),
      load(['/font.ttf'], fetchFont),
    ])

    expect(first).toBe(second)
    expect(fetchFont).toHaveBeenCalledTimes(1)
  })

  it('keeps each cache to itself', async () => {
    const first = vi.fn(async () => fontResponse(TRUETYPE))
    const second = vi.fn(async () => fontResponse(CFF))

    await createOgFontCache()(['/font.ttf'], first)
    await createOgFontCache()(['/font.ttf'], second)

    expect(second).toHaveBeenCalledTimes(1)
  })
})
