import { describe, expect, it, vi } from 'vitest'
import {
  createAccessTokenGetter,
  tokenLifetimeMs,
} from './rhinestoneAccessToken'

vi.mock('./issueRhinestoneAccessToken', () => ({
  issueRhinestoneAccessToken: vi.fn(),
}))

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** A token minted at `iatMs` on the SERVER's clock, good for `lifetimeMs`. */
const tokenMintedAt = (iatMs: number, lifetimeMs = HOUR): string => {
  const iat = Math.floor(iatMs / 1000)
  const payload = btoa(
    JSON.stringify({ iat, exp: iat + lifetimeMs / 1000, typ: 'access' }),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `eyJhbGciOiJFUzI1NiJ9.${payload}.sig`
}

describe('tokenLifetimeMs', () => {
  it('reads the lifetime from exp minus iat', () => {
    expect(tokenLifetimeMs(tokenMintedAt(1_000_000, HOUR))).toBe(HOUR)
  })

  it('assumes a short lifetime when the claims cannot be read', () => {
    expect(tokenLifetimeMs('not-a-jwt')).toBe(10 * MINUTE)
    expect(tokenLifetimeMs('a.!!!.c')).toBe(10 * MINUTE)
  })
})

describe('createAccessTokenGetter', () => {
  it('mints once and reuses the token until it is close to expiry', async () => {
    let now = 1_000_000
    const mint = vi.fn(async () => tokenMintedAt(now))
    const getToken = createAccessTokenGetter(mint, () => now)

    const first = await getToken()
    now += 30 * MINUTE
    const second = await getToken()

    expect(second).toBe(first)
    expect(mint).toHaveBeenCalledTimes(1)
  })

  it('mints again once the renewal point passes', async () => {
    let now = 1_000_000
    const mint = vi.fn(async () => tokenMintedAt(now))
    const getToken = createAccessTokenGetter(mint, () => now)

    const first = await getToken()
    now += 56 * MINUTE
    const second = await getToken()

    expect(second).not.toBe(first)
    expect(mint).toHaveBeenCalledTimes(2)
  })

  it('renews on the token lifetime even when the browser clock is wrong', async () => {
    // The server stamps iat/exp from its own clock. The browser here is ten
    // minutes slow (and would be just as wrong ten minutes fast): the token
    // must still be replaced 55 minutes after it was received, not 65.
    const serverNow = 1_000_000
    let browserNow = serverNow - 10 * MINUTE
    const mint = vi.fn(async () => tokenMintedAt(serverNow))
    const getToken = createAccessTokenGetter(mint, () => browserNow)

    await getToken()
    browserNow += 54 * MINUTE
    await getToken()
    expect(mint).toHaveBeenCalledTimes(1)

    browserNow += 2 * MINUTE
    await getToken()
    expect(mint).toHaveBeenCalledTimes(2)
  })

  it('shares one mint between concurrent callers', async () => {
    const mint = vi.fn(async () => tokenMintedAt(0))
    const getToken = createAccessTokenGetter(mint, () => 0)

    const tokens = await Promise.all([getToken(), getToken(), getToken()])

    expect(new Set(tokens).size).toBe(1)
    expect(mint).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed mint', async () => {
    const mint = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce(tokenMintedAt(0))
    const getToken = createAccessTokenGetter(mint, () => 0)

    await expect(getToken()).rejects.toThrow('rate limited')
    await expect(getToken()).resolves.toMatch(/^eyJ/)
    expect(mint).toHaveBeenCalledTimes(2)
  })
})
