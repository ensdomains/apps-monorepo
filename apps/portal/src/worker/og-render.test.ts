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
  registryChipLabel,
  renderAddressOgImage,
  renderOgImage,
  renderRegistryOgImage,
  renderResolverOgImage,
  resolverChipLabel,
} = await import('./og-render')

// Fonts are irrelevant here: a 404 leaves the font list empty, which is already
// the production behaviour when an asset lookup misses.
const env = {
  ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
} as unknown as Env

const ADDRESS = '0xCC692D6E11268B40A1E3C58e3D86Fc4CAAb9b77a'
const OWNER = '0x1234567890123456789012345678901234567890'
const URL_ = 'https://example.com/og/snowman.eth.png'

beforeEach(() => {
  og.htmls = []
  og.render = () =>
    new Response(new ArrayBuffer(8), {
      headers: { 'Content-Type': 'image/png' },
    })
})

describe('chip labels', () => {
  // An address that is nobody's known ENS contract, so both fall through to the
  // label the route itself implies.
  it('calls an unknown permissioned resolver an owned resolver', () => {
    expect(resolverChipLabel(ADDRESS, true)).toBe('owned resolver')
  })

  it('calls any other resolver a plain resolver', () => {
    expect(resolverChipLabel(ADDRESS, false)).toBe('resolver')
  })

  it('calls an unknown registry a permissioned registry', () => {
    expect(registryChipLabel(ADDRESS)).toBe('permissioned registry')
  })
})

describe('entity colour coding', () => {
  // The point of the set (WEB-1265): the tint says what kind of thing the link
  // is about before the page opens. The fills mirror --{accent,success,danger}
  // -fill in styles/index.css.
  it('tints a name card blue', async () => {
    await renderOgImage('snowman.eth', null, OWNER, URL_, env)

    expect(og.htmls[0]).toContain('#ebf7fd')
  })

  it('tints an address card green', async () => {
    await renderAddressOgImage(ADDRESS, URL_, env)

    expect(og.htmls[0]).toContain('#e8f6ef')
  })

  it('tints a resolver card pink', async () => {
    await renderResolverOgImage(ADDRESS, URL_, env, true)

    expect(og.htmls[0]).toContain('#fef0f6')
  })

  it('tints a registry card pink', async () => {
    await renderRegistryOgImage(ADDRESS, URL_, env)

    expect(og.htmls[0]).toContain('#fef0f6')
  })
})

describe('renderAddressOgImage', () => {
  it('carries the address in the chip and no subtitle without a primary name', async () => {
    await renderAddressOgImage(ADDRESS, URL_, env)

    expect(og.htmls[0]).toContain(ADDRESS)
    // The subtitle is the only 808px-wide element on the card.
    expect(og.htmls[0]).not.toContain('width: 808px')
  })

  it('puts the primary name under the address when there is one', async () => {
    await renderAddressOgImage(ADDRESS, URL_, env, 'snowman.eth')

    expect(og.htmls[0]).toContain('snowman.eth')
  })
})

describe('renderOgImage', () => {
  const AVATAR = 'data:image/jpeg;base64,AAAA'

  const renderName = () =>
    renderOgImage('snowman.eth', AVATAR, OWNER, URL_, env)

  it('renders a PNG when the avatar renders', async () => {
    const res = await renderName()

    expect(res?.status).toBe(200)
    expect(res?.headers.get('Content-Type')).toBe('image/png')
    expect(og.htmls).toHaveLength(1)
    expect(og.htmls[0]).toContain(AVATAR)
  })

  it('renders the owner address as the subtitle', async () => {
    await renderName()

    expect(og.htmls[0]).toContain(OWNER)
  })

  it('offers an unowned name as available', async () => {
    await renderOgImage('snowman.eth', null, null, URL_, env)

    expect(og.htmls[0]).toContain('Available to register')
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
    // The retry falls back to the same text-only chip an avatar-less name gets,
    // rather than dropping the card entirely.
    expect(og.htmls[1]).not.toContain(AVATAR)
    expect(og.htmls[1]).toContain('>snowman.eth</div>')
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
