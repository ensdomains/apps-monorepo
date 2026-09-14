import { beforeEach, describe, expect, it, vi } from 'vitest'

// workers-og loads a WASM module at import time that the node test environment
// can't resolve. Stub it, recording the HTML each render was handed and letting
// a test decide how that render behaves.
const og = vi.hoisted(() => ({
  htmls: [] as string[],
  render: (_html: string): ArrayBuffer => new ArrayBuffer(8),
}))

vi.mock('workers-og', () => ({
  ImageResponse: class {
    readonly html: string
    constructor(html: string) {
      this.html = html
      og.htmls.push(html)
    }
    arrayBuffer(): Promise<ArrayBuffer> {
      return Promise.resolve(og.render(this.html))
    }
  },
}))

const { renderOgCard } = await import('./render')

describe('renderOgCard', () => {
  beforeEach(() => {
    og.htmls = []
    og.render = () => new ArrayBuffer(8)
  })

  it('returns a cacheable PNG', async () => {
    const response = await renderOgCard('<div>card</div>', { fonts: [] })

    expect(response?.status).toBe(200)
    expect(response?.headers.get('Content-Type')).toBe('image/png')
    expect(response?.headers.get('Cache-Control')).toBe(
      'public, max-age=3600, s-maxage=3600',
    )
  })

  it('collapses the markup before satori sees it', async () => {
    await renderOgCard(
      `
      <div style="display: flex; gap: 48px;">
        <img src="a.svg" />
      </div>`,
      { fonts: [] },
    )

    // The whitespace would otherwise become a flex child and open a gap before
    // the image — see collapseMarkup.
    expect(og.htmls[0]).toBe(
      '<div style="display: flex; gap: 48px;"><img src="a.svg" /></div>',
    )
  })

  it('reports null when the render throws', async () => {
    og.render = () => {
      throw new Error('Out of memory')
    }

    // null, not a throw: an uncaught error here reaches the runtime as a 1101,
    // which breaks the card on every page that references it at once.
    expect(await renderOgCard('<div>card</div>', { fonts: [] })).toBeNull()
  })

  it('reports null when the render yields no bytes instead of throwing', async () => {
    og.render = () => new ArrayBuffer(0)

    expect(await renderOgCard('<div>card</div>', { fonts: [] })).toBeNull()
  })
})
