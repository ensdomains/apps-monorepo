import * as fc from 'fast-check'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { safeFetch } from './safe-fetch'

const SELF_HOST = 'portal.example'
const MAX_BYTES = 1024

const fetchSpy = vi.spyOn(globalThis, 'fetch')

const imageResponse = (): Response =>
  new Response(Uint8Array.from([1, 2, 3]), {
    headers: { 'content-type': 'image/png; charset=binary' },
  })

const options = {
  accept: (contentType: string) => contentType.startsWith('image/'),
  maxBytes: MAX_BYTES,
  selfHost: SELF_HOST,
}

const casedSelfHostArbitrary = fc
  .array(fc.boolean(), {
    minLength: SELF_HOST.length,
    maxLength: SELF_HOST.length,
  })
  .map((uppercase) =>
    [...SELF_HOST]
      .map((character, index) =>
        uppercase[index] ? character.toUpperCase() : character,
      )
      .join(''),
  )

const equivalentSelfUrlArbitrary = fc
  .record({
    host: fc.oneof(
      casedSelfHostArbitrary,
      fc.constant('%70ortal.example'),
      fc.constant('ｐortal.example'),
    ),
    hasTrailingDot: fc.boolean(),
    hasExplicitPort: fc.boolean(),
    scheme: fc.constantFrom('https', 'HTTPS', 'Https'),
  })
  .map(
    ({ host, hasTrailingDot, hasExplicitPort, scheme }) =>
      `${scheme}://${host}${hasTrailingDot ? '.' : ''}${hasExplicitPort ? ':443' : ''}/avatar.png`,
  )

const ipv4HostArbitrary = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  )
  .chain(([a, b, c, d]) => {
    const dotted = `${a}.${b}.${c}.${d}`
    const decimal = ((a * 256 + b) * 256 + c) * 256 + d
    const short = `${a}.${b * 65536 + c * 256 + d}`
    const octal = [a, b, c, d].map((octet) => `0${octet.toString(8)}`).join('.')
    const hexadecimal = `0x${decimal.toString(16)}`
    const hexadecimalOctets = [a, b, c, d]
      .map((octet) => `0x${octet.toString(16)}`)
      .join('.')

    return fc.constantFrom(
      dotted,
      decimal.toString(),
      short,
      octal,
      hexadecimal,
      hexadecimalOctets,
      `[::ffff:${dotted}]`,
    )
  })

const ipLiteralUrlArbitrary = ipv4HostArbitrary.map(
  (host) => `https://${host}/avatar.png`,
)

const redirectForbiddenUrlArbitrary = fc.oneof(
  ipLiteralUrlArbitrary,
  fc.constant('https://portal.example./avatar.png'),
  fc.constant('HTTPS://PORTAL.EXAMPLE:443/avatar.png'),
)

describe('safeFetch URL guards', () => {
  beforeEach(() => {
    fetchSpy.mockReset()
  })

  afterAll(() => {
    fetchSpy.mockRestore()
  })

  it('rejects every generated equivalent spelling of its own host', async () => {
    await fc.assert(
      fc.asyncProperty(equivalentSelfUrlArbitrary, async (url) => {
        fetchSpy.mockRejectedValue(new Error('unexpected outbound fetch'))

        expect(await safeFetch(url, options)).toBeNull()
        expect(fetchSpy).not.toHaveBeenCalled()
      }),
    )
  })

  it('rejects generated IPv4 literals across WHATWG-supported spellings', async () => {
    await fc.assert(
      fc.asyncProperty(ipLiteralUrlArbitrary, async (url) => {
        fetchSpy.mockRejectedValue(new Error('unexpected outbound fetch'))

        expect(await safeFetch(url, options)).toBeNull()
        expect(fetchSpy).not.toHaveBeenCalled()
      }),
    )
  })

  it('revalidates every generated forbidden redirect destination', async () => {
    await fc.assert(
      fc.asyncProperty(redirectForbiddenUrlArbitrary, async (redirectTo) => {
        fetchSpy.mockReset()
        fetchSpy
          .mockResolvedValueOnce(
            new Response(null, {
              status: 302,
              headers: { location: redirectTo },
            }),
          )
          .mockResolvedValue(imageResponse())

        expect(
          await safeFetch('https://images.example/avatar.png', options),
        ).toBeNull()
        expect(fetchSpy).toHaveBeenCalledTimes(1)
      }),
    )
  })

  it('allows a neutral HTTPS hostname through the same guarded fetch', async () => {
    fetchSpy.mockResolvedValueOnce(imageResponse())

    const result = await safeFetch('https://images.example/avatar.png', options)

    expect(result).toEqual({
      bytes: Uint8Array.from([1, 2, 3]),
      contentType: 'image/png',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
