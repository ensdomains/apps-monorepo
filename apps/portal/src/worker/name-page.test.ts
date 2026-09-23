// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * End-to-end cover for the name page's meta injection (Immunefi #92466).
 *
 * `worker.ts` reaches for Cloudflare globals, so the runtime pieces it needs
 * are stubbed here: `HTMLRewriter` (captures what the injector appends) and an
 * `ASSETS` binding serving the SPA shell. Everything between — routing, record
 * fetching, the meta block and the fallback — is the real code.
 */

const mockFetchEnsData = vi.fn()

vi.mock('./ens', () => ({
  fetchEnsData: (...args: unknown[]) => mockFetchEnsData(...args),
  fetchIsPermissionedResolver: vi.fn().mockResolvedValue(false),
}))

// satori + font loading at module scope; the name page never renders a card.
vi.mock('./og-render', () => ({
  renderAddressOgImage: vi.fn(),
  renderDefaultOgImage: vi.fn(),
  renderOgImage: vi.fn(),
  renderRegistryOgImage: vi.fn(),
  renderResolverOgImage: vi.fn(),
  renderTldOgImage: vi.fn(),
}))

let injectedHtml = ''

class StubHTMLRewriter {
  private readonly handlers: { selector: string; handler: unknown }[] = []

  on(selector: string, handler: unknown) {
    this.handlers.push({ selector, handler })
    return this
  }

  transform(response: Response) {
    for (const { selector, handler } of this.handlers) {
      if (selector !== 'head') continue
      ;(handler as { element: (element: unknown) => void }).element({
        append: (content: string) => {
          injectedHtml += content
        },
      })
    }
    return response
  }
}

vi.stubGlobal('HTMLRewriter', StubHTMLRewriter)

const shell = () =>
  new Response('<html><head></head><body></body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })

const env = {
  ASSETS: { fetch: vi.fn(async () => shell()) },
} as unknown as Env

const worker = await import('../worker')

const get = (path: string) =>
  worker.default.fetch(
    new Request(`https://explorer.ens.dev${path}`, {
      headers: { Accept: 'text/html' },
    }),
    env,
  )

describe('name page meta injection', () => {
  beforeEach(() => {
    injectedHtml = ''
    mockFetchEnsData.mockReset()
  })

  it('serves a bounded meta block for a 1 MiB description record', async () => {
    mockFetchEnsData.mockResolvedValue({
      avatar: null,
      description: '"'.repeat(1024 * 1024),
      owner: null,
    })

    const response = await get('/alice.eth')

    expect(response.status).toBe(200)
    // Uncapped this was ~12.5M characters and 57 MiB of heap.
    expect(injectedHtml.length).toBeLessThan(8 * 1024)
    expect(injectedHtml).toContain('og:description')
  })

  it('still serves the real description for a normal record', async () => {
    mockFetchEnsData.mockResolvedValue({
      avatar: null,
      description: 'A regular ENS profile.',
      owner: null,
    })

    const response = await get('/alice.eth')

    expect(response.status).toBe(200)
    expect(injectedHtml).toContain(
      '<meta property="og:description" content="A regular ENS profile." />',
    )
  })

  it('falls back to the default card when the name page throws', async () => {
    mockFetchEnsData.mockRejectedValue(new Error('resolver exploded'))

    const response = await get('/alice.eth')

    expect(response.status).toBe(200)
    expect(injectedHtml).toContain('Explore ENS names and addresses')
  })
})
