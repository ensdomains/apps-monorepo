import { beforeEach, describe, expect, it, vi } from 'vitest'

// og-render renders through @ens-apps/og, which pulls in a WASM module the node
// test environment can't resolve. Stub the renderer, recording the HTML each
// card was built from and letting a test decide how that render resolves — that
// hook is what drives the degradation paths below. Whether a card rasterises at
// all is the package's own concern, and tested there.
const og = vi.hoisted(() => ({
  htmls: [] as string[],
  render: (_html: string): Response | null =>
    new Response(new ArrayBuffer(8), {
      headers: { 'Content-Type': 'image/png' },
    }),
}))

vi.mock('@ens-apps/og/render', () => ({
  OG_CARD_HEIGHT: 630,
  OG_CARD_WIDTH: 1200,
  renderOgCard: (html: string) => {
    og.htmls.push(html)
    return Promise.resolve(og.render(html))
  },
}))

const {
  resolverSubtitle,
  resolverPageLabel,
  registryPageLabel,
  renderOgImage,
} = await import('./og-render')

describe('resolverSubtitle', () => {
  it('labels permissioned resolvers', () => {
    expect(resolverSubtitle(true)).toBe('Permissioned Resolver')
  })

  it('labels plain resolvers', () => {
    expect(resolverSubtitle(false)).toBe('Resolver')
  })
})

describe('resolverPageLabel', () => {
  it('defaults to the overview label', () => {
    expect(resolverPageLabel(null)).toBe('Resolver Overview')
  })

  it('maps known subpages', () => {
    expect(resolverPageLabel('roles')).toBe('Roles')
    expect(resolverPageLabel('nodes')).toBe('Nodes')
    expect(resolverPageLabel('aliases')).toBe('Aliases')
    expect(resolverPageLabel('create-alias')).toBe('Create Alias')
    expect(resolverPageLabel('history')).toBe('History')
  })

  it('title-cases unknown subpages', () => {
    expect(resolverPageLabel('something')).toBe('Something')
  })
})

describe('registryPageLabel', () => {
  it('defaults to the overview label', () => {
    expect(registryPageLabel(null)).toBe('Registry Overview')
  })

  it('maps known subpages', () => {
    expect(registryPageLabel('labels')).toBe('Labels')
    expect(registryPageLabel('roles')).toBe('Roles')
    expect(registryPageLabel('history')).toBe('History')
  })
})

describe('renderOgImage', () => {
  // Fonts are irrelevant here: a 404 leaves the font list empty, which is
  // already the production behaviour when an asset lookup misses.
  const env = {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
  } as unknown as Env

  const AVATAR = 'data:image/jpeg;base64,AAAA'
  const OWNER = '0x1234567890123456789012345678901234567890'
  const URL_ = 'https://example.com/og/snowman.eth.png'

  const renderName = () =>
    renderOgImage('snowman.eth', AVATAR, OWNER, URL_, env)

  beforeEach(() => {
    og.htmls = []
    og.render = () =>
      new Response(new ArrayBuffer(8), {
        headers: { 'Content-Type': 'image/png' },
      })
  })

  it('renders a PNG when the avatar renders', async () => {
    const res = await renderName()

    expect(res?.status).toBe(200)
    expect(res?.headers.get('Content-Type')).toBe('image/png')
    expect(og.htmls).toHaveLength(1)
    expect(og.htmls[0]).toContain(AVATAR)
  })

  it('retries without the avatar when that card fails to render', async () => {
    // An avatar is the one element of the card sized by someone else, so it is
    // the part a render realistically dies on — see renderOgCard.
    og.render = (html) =>
      html.includes(AVATAR)
        ? null
        : new Response(new ArrayBuffer(8), {
            headers: { 'Content-Type': 'image/png' },
          })

    const res = await renderName()

    expect(res?.status).toBe(200)
    expect(og.htmls).toHaveLength(2)
    // The retry falls back to the same initial-letter tile an avatar-less name
    // gets, rather than dropping the card entirely.
    expect(og.htmls[1]).not.toContain(AVATAR)
    expect(og.htmls[1]).toContain('>S</div>')
  })

  it('reports null when the card fails to render with or without the avatar', async () => {
    og.render = () => null

    // null, not a throw: an uncaught error here reaches the runtime as a 1101,
    // which breaks the card on the name page and every subpage at once.
    expect(await renderName()).toBeNull()
    expect(og.htmls).toHaveLength(2)
  })

  it('does not retry a card that never had an avatar', async () => {
    og.render = () => null

    expect(
      await renderOgImage('snowman.eth', null, OWNER, URL_, env),
    ).toBeNull()
    expect(og.htmls).toHaveLength(1)
  })
})
