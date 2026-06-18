import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockResolveEnsOwner = vi.fn()
const mockParseAvatarRecord = vi.fn()

vi.mock('@ensdomains/ensjs/public', () => ({
  getRecords: vi.fn(),
}))

vi.mock('viem/ens', () => ({
  parseAvatarRecord: (...args: unknown[]) => mockParseAvatarRecord(...args),
}))

vi.mock('@/utils/ens/resolveEnsOwner', () => ({
  resolveEnsOwner: (...args: unknown[]) => mockResolveEnsOwner(...args),
}))

const { resolveOwner, resolveAvatarDataUri } = await import('./ens')

const OWNER = '0x1111111111111111111111111111111111111111'
const client = {} as never

/** Build a Response whose body streams the given bytes in fixed-size chunks. */
function streamingResponse(
  bytes: Uint8Array,
  { contentType = 'image/png', chunkSize = 64 } = {},
): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        controller.enqueue(bytes.subarray(i, i + chunkSize))
      }
      controller.close()
    },
  })
  return new Response(body, { headers: { 'content-type': contentType } })
}

describe('resolveOwner (worker)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns just the owner address from the shared resolver', async () => {
    mockResolveEnsOwner.mockResolvedValueOnce({
      owner: OWNER,
      registryAddress: '0x00000000000000000000000000000000000ce610',
      protocolVersion: 'ENSv2',
    })

    const owner = await resolveOwner(client, 'alice.ledgit.eth')

    expect(owner).toBe(OWNER)
    expect(mockResolveEnsOwner).toHaveBeenCalledWith(client, 'alice.ledgit.eth')
  })

  it('returns null when the name is unowned (renders as "available")', async () => {
    mockResolveEnsOwner.mockResolvedValueOnce(null)

    const owner = await resolveOwner(client, 'unclaimed.eth')

    expect(owner).toBeNull()
  })

  it('returns null when the shared resolver throws', async () => {
    mockResolveEnsOwner.mockRejectedValueOnce(new Error('rpc down'))

    const owner = await resolveOwner(client, 'ledgit.eth')

    expect(owner).toBeNull()
  })
})

describe('resolveAvatarDataUri (worker)', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    fetchSpy.mockReset()
  })

  it('embeds a fetched image as a base64 data URI', async () => {
    mockParseAvatarRecord.mockResolvedValueOnce('https://cdn.example/cat.png')
    fetchSpy.mockResolvedValueOnce(
      streamingResponse(new Uint8Array([1, 2, 3, 4]), {
        contentType: 'image/png',
      }),
    )

    const result = await resolveAvatarDataUri(client, 'cat.png')

    expect(result).toBe(`data:image/png;base64,${btoa('\x01\x02\x03\x04')}`)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('passes inline data: URIs through without fetching', async () => {
    const inline = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    mockParseAvatarRecord.mockResolvedValueOnce(inline)

    const result = await resolveAvatarDataUri(client, '<svg></svg>')

    expect(result).toBe(inline)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects non-image content types', async () => {
    mockParseAvatarRecord.mockResolvedValueOnce('https://evil.example/page')
    fetchSpy.mockResolvedValueOnce(
      streamingResponse(new Uint8Array([0]), { contentType: 'text/html' }),
    )

    const result = await resolveAvatarDataUri(client, 'evil')

    expect(result).toBeNull()
  })

  it('rejects payloads larger than the 5MB cap', async () => {
    mockParseAvatarRecord.mockResolvedValueOnce('https://evil.example/huge.png')
    const tooBig = new Uint8Array(5 * 1024 * 1024 + 1)
    fetchSpy.mockResolvedValueOnce(
      streamingResponse(tooBig, {
        contentType: 'image/png',
        chunkSize: 64 * 1024,
      }),
    )

    const result = await resolveAvatarDataUri(client, 'huge')

    expect(result).toBeNull()
  })

  it('passes an abort signal (timeout) to fetch', async () => {
    mockParseAvatarRecord.mockResolvedValueOnce('https://cdn.example/cat.png')
    fetchSpy.mockResolvedValueOnce(
      streamingResponse(new Uint8Array([1]), { contentType: 'image/png' }),
    )

    await resolveAvatarDataUri(client, 'cat.png')

    const init = fetchSpy.mock.calls[0]?.[1]
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('returns null when the upstream responds with a non-ok status', async () => {
    mockParseAvatarRecord.mockResolvedValueOnce('https://cdn.example/cat.png')
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 502 }))

    const result = await resolveAvatarDataUri(client, 'cat.png')

    expect(result).toBeNull()
  })

  it('returns null when fetch throws (e.g. timeout/abort)', async () => {
    mockParseAvatarRecord.mockResolvedValueOnce('https://slow.example/cat.png')
    fetchSpy.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))

    const result = await resolveAvatarDataUri(client, 'cat.png')

    expect(result).toBeNull()
  })

  it('returns null when avatar parsing throws', async () => {
    mockParseAvatarRecord.mockRejectedValueOnce(new Error('bad record'))

    const result = await resolveAvatarDataUri(client, 'bad')

    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
