import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../index'

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1cAAAAASUVORK5CYII=',
  ),
  (character) => character.charCodeAt(0),
)
const html = (body: string, headers?: HeadersInit) =>
  new Response(body, { headers: { 'Content-Type': 'text/html', ...headers } })
const image = (headers?: HeadersInit) =>
  new Response(PNG, { headers: { 'Content-Type': 'image/png', ...headers } })

describe('GET /link-preview/image', () => {
  const upstream = vi.fn<typeof fetch>()
  let pageUrl: string

  const request = async (
    url = pageUrl,
    bindings: Partial<CloudflareBindings> = {},
    origin = 'https://api.ens.domains',
  ) => {
    const ctx = createExecutionContext()
    const response = await app.request(
      `${origin}/link-preview/image?url=${encodeURIComponent(url)}`,
      {
        headers: {
          Authorization: 'Bearer visitor-secret',
          Cookie: 'visitor=secret',
          Referer: 'https://app.ens.domains/private-profile',
        },
      },
      { ...env, ...bindings },
      ctx,
    )
    await waitOnExecutionContext(ctx)
    return response
  }

  beforeEach(() => {
    pageUrl = `https://example.com/${crypto.randomUUID()}`
    upstream.mockReset()
    vi.stubGlobal('fetch', upstream)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('serves the OG image without forwarding visitor credentials or referrers', async () => {
    upstream
      .mockResolvedValueOnce(
        html('<meta property="og:image" content="/og.png">'),
      )
      .mockResolvedValueOnce(image())

    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
    expect(upstream.mock.calls.map(([url]) => String(url))).toEqual([
      pageUrl,
      'https://example.com/og.png',
    ])
    for (const [, init] of upstream.mock.calls) {
      const headers = new Headers(init?.headers)
      expect(headers.has('Authorization')).toBe(false)
      expect(headers.has('Cookie')).toBe(false)
      expect(headers.has('Referer')).toBe(false)
      expect(init?.redirect).toBe('manual')
    }
  })

  it('serves repeated requests from the image cache without upstream calls', async () => {
    upstream
      .mockResolvedValueOnce(
        html('<meta property="og:image" content="/og.png">'),
      )
      .mockResolvedValueOnce(image())
    await request()
    const response = await request(`${pageUrl}#fragment`)
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it.each([
    [
      'secure OG',
      '<meta property="og:image" content="/plain.png"><meta property="og:image:secure_url" content="https://cdn.example.com/secure.png"><meta name="twitter:image" content="/twitter.png">',
      'https://cdn.example.com/secure.png',
    ],
    [
      'Twitter fallback',
      '<meta property="og:image" content="javascript:bad"><meta name="twitter:image" content="../twitter.png">',
      'https://example.com/twitter.png',
    ],
    [
      'HTML base URL',
      '<meta property="og:image" content="og.png"><base href="https://cdn.example.com/assets/">',
      'https://cdn.example.com/assets/og.png',
    ],
  ])('selects %s metadata', async (_label, markup, expectedUrl) => {
    upstream.mockResolvedValueOnce(html(markup)).mockResolvedValueOnce(image())
    expect((await request()).status).toBe(200)
    expect(String(upstream.mock.calls[1]?.[0])).toBe(expectedUrl)
  })

  it('resolves relative metadata against the final redirected page URL', async () => {
    upstream
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: '/articles/page' },
        }),
      )
      .mockResolvedValueOnce(
        html('<meta property="og:image" content="og.png">'),
      )
      .mockResolvedValueOnce(image())
    expect((await request()).status).toBe(200)
    expect(String(upstream.mock.calls[2]?.[0])).toBe(
      'https://example.com/articles/og.png',
    )
  })

  it.each([
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'http://127.1',
    'http://[::1]',
    'http://2130706433',
    'http://localhost',
    'https://service.internal',
    'https://example.com:8443',
    'https://api.ens.domains/link-preview/image?url=x',
    'https://api.ens.domains/link-preview/%69mage?url=x',
    'https://api.ens.domains/link%2dpreview/image?url=x',
  ])('rejects the target %s before fetching', async (url) => {
    expect((await request(url)).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each(['page', 'image'])(
    'rejects a %s redirect to a local target',
    async (resource) => {
      if (resource === 'image')
        upstream.mockResolvedValueOnce(
          html('<meta property="og:image" content="/og.png">'),
        )
      upstream.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
        }),
      )
      expect((await request()).status).toBe(404)
      expect(upstream).toHaveBeenCalledTimes(resource === 'image' ? 2 : 1)
    },
  )

  it('stops after three redirects for one resource', async () => {
    upstream.mockImplementation(
      async () =>
        new Response(null, { status: 302, headers: { Location: '/again' } }),
    )
    expect((await request()).status).toBe(404)
    expect(upstream).toHaveBeenCalledTimes(4)
  })

  it('caches a missing image for one hour without upstream calls', async () => {
    upstream.mockResolvedValueOnce(html('<title>No image</title>'))
    expect((await request()).status).toBe(404)
    expect((await request()).status).toBe(404)
    expect(upstream).toHaveBeenCalledOnce()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 3_601_000)
    upstream
      .mockResolvedValueOnce(
        html('<meta property="og:image" content="/new.png">'),
      )
      .mockResolvedValueOnce(image())
    expect((await request()).status).toBe(200)
  })

  it('retries temporary failures after five minutes', async () => {
    upstream.mockRejectedValueOnce(new Error('upstream offline'))
    expect((await request()).status).toBe(502)
    expect((await request()).status).toBe(502)
    expect(upstream).toHaveBeenCalledOnce()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 301_000)
    upstream
      .mockResolvedValueOnce(
        html('<meta property="og:image" content="/new.png">'),
      )
      .mockResolvedValueOnce(image())
    expect((await request()).status).toBe(200)
  })

  it('re-discovers the page after 24 hours even if the edge response still exists', async () => {
    upstream
      .mockResolvedValueOnce(
        html('<meta property="og:image" content="/old.png">'),
      )
      .mockResolvedValueOnce(image())
    await request()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 86_401_000)
    upstream
      .mockResolvedValueOnce(
        html('<meta property="og:image" content="/new.png">'),
      )
      .mockResolvedValueOnce(image())
    expect((await request()).status).toBe(200)
    expect(upstream.mock.calls.map(([url]) => String(url))).toEqual([
      pageUrl,
      'https://example.com/old.png',
      pageUrl,
      'https://example.com/new.png',
    ])
  })

  it.each(['private', 'no-store'])(
    'does not persist a %s upstream response',
    async (directive) => {
      upstream.mockImplementation(async (url) =>
        String(url) === pageUrl
          ? html('<meta property="og:image" content="/og.png">', {
              'Cache-Control': directive,
            })
          : image(),
      )
      expect((await request()).headers.get('Cache-Control')).toBe('no-store')
      expect((await request()).status).toBe(200)
      expect(upstream).toHaveBeenCalledTimes(4)
    },
  )

  it.each(['HTML', 'image'])(
    'does not cache a preview with an expired %s response',
    async (resource) => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)
      const expiredHeaders = {
        Date: new Date(now - 120_000).toUTCString(),
        Expires: new Date(now - 60_000).toUTCString(),
      }
      upstream.mockImplementation(async (url) =>
        String(url) === pageUrl
          ? html(
              '<meta property="og:image" content="/og.png">',
              resource === 'HTML' ? expiredHeaders : {},
            )
          : image(resource === 'image' ? expiredHeaders : {}),
      )

      expect((await request()).headers.get('Cache-Control')).toBe('no-store')
      expect((await request()).status).toBe(200)
      expect(upstream).toHaveBeenCalledTimes(4)
    },
  )

  it.each(['image/svg+xml', 'text/html'])(
    'rejects %s image responses',
    async (contentType) => {
      upstream
        .mockResolvedValueOnce(html('<meta property="og:image" content="/og">'))
        .mockResolvedValueOnce(
          new Response('<svg/>', { headers: { 'Content-Type': contentType } }),
        )
      expect((await request()).status).toBe(404)
      expect(upstream).toHaveBeenCalledTimes(2)
    },
  )

  it('uses KV metadata on an edge miss and caps both caches at its original expiry', async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    upstream
      .mockResolvedValueOnce(
        html('<meta property="og:image" content="/og.png">'),
      )
      .mockResolvedValueOnce(image())
    await request()
    clock.mockReturnValue(now + 86_370_000)
    upstream.mockResolvedValueOnce(image())
    const response = await request(pageUrl, {}, 'https://preview.ens.domains')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=30, s-maxage=30, must-revalidate',
    )
    expect(upstream.mock.calls.map(([url]) => String(url))).toEqual([
      pageUrl,
      'https://example.com/og.png',
      'https://example.com/og.png',
    ])
  })

  it('still serves the image when KV and the image cache are unavailable', async () => {
    vi.spyOn(caches.default, 'match').mockRejectedValue(
      new Error('cache offline'),
    )
    vi.spyOn(caches.default, 'put').mockRejectedValue(
      new Error('cache offline'),
    )
    upstream
      .mockResolvedValueOnce(
        html('<meta property="og:image" content="/og.png">'),
      )
      .mockResolvedValueOnce(image())
    const response = await request(pageUrl, {
      KV: {
        ...env.KV,
        get: () => Promise.reject(new Error('KV offline')),
        put: () => Promise.reject(new Error('KV offline')),
      },
    })
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
  })

  it.each(['HTML', 'image'])(
    'cancels an oversized streamed %s body without Content-Length',
    async (resource) => {
      const cancel = vi.fn()
      if (resource === 'image')
        upstream.mockResolvedValueOnce(
          html('<meta property="og:image" content="/og.png">'),
        )
      upstream.mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(new Uint8Array(64 * 1024))
            },
            cancel,
          }),
          {
            headers: {
              'Content-Type': resource === 'HTML' ? 'text/html' : 'image/png',
            },
          },
        ),
      )
      expect((await request()).status).toBe(404)
      expect(cancel).toHaveBeenCalledOnce()
      expect(upstream).toHaveBeenCalledTimes(resource === 'image' ? 2 : 1)
    },
  )

  it('aborts a stalled lookup at the shared ten-second deadline', async () => {
    vi.useFakeTimers()
    upstream.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          )
        }),
    )
    const pending = request()
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(10_001)
    expect((await pending).status).toBe(502)
    expect(upstream.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it('rejects an HTML body mislabeled as a supported image', async () => {
    upstream
      .mockResolvedValueOnce(
        html('<meta property="og:image" content="/og.png">'),
      )
      .mockResolvedValueOnce(
        new Response('<html>not an image</html>', {
          headers: { 'Content-Type': 'image/png' },
        }),
      )
    expect((await request()).status).toBe(404)
  })

  it('does not cache an image whose origin marks it private', async () => {
    upstream.mockImplementation(async (url) =>
      String(url) === pageUrl
        ? html('<meta property="og:image" content="/og.png">')
        : image({ 'Cache-Control': 'private' }),
    )
    expect((await request()).headers.get('Cache-Control')).toBe('no-store')
    await request()
    expect(upstream).toHaveBeenCalledTimes(4)
  })

  it('does not cache a failure after following a no-store redirect', async () => {
    upstream
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: '/destination', 'Cache-Control': 'no-store' },
        }),
      )
      .mockRejectedValueOnce(new Error('destination offline'))
    const response = await request()
    expect(response.status).toBe(502)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('serves uncached previews with only the KV environment binding', async () => {
    upstream
      .mockResolvedValueOnce(
        html('<meta property="og:image" content="/og.png">'),
      )
      .mockResolvedValueOnce(image())
    const ctx = createExecutionContext()
    const bindings = new Proxy(env, {
      get(target, key, receiver) {
        if (key !== 'KV')
          throw new Error(`Unexpected environment binding: ${String(key)}`)
        return Reflect.get(target, key, receiver)
      },
    })
    const response = await app.request(
      `https://api.ens.domains/link-preview/image?url=${encodeURIComponent(pageUrl)}`,
      undefined,
      bindings,
      ctx,
    )
    await waitOnExecutionContext(ctx)
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
    expect(upstream).toHaveBeenCalledTimes(2)
  })
})
