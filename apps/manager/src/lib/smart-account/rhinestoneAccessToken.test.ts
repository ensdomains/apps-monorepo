import { describe, expect, it, vi } from 'vitest'
import { createAccessTokenGetter, renewAtFor } from './rhinestoneAccessToken'

vi.mock('./issueRhinestoneAccessToken', () => ({
  issueRhinestoneAccessToken: vi.fn(),
}))

const MINUTE = 60_000

const tokenExpiringAt = (expSeconds: number): string => {
  const payload = btoa(JSON.stringify({ exp: expSeconds, typ: 'access' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `eyJhbGciOiJFUzI1NiJ9.${payload}.sig`
}

describe('renewAtFor', () => {
  it('renews five minutes before the token expires', () => {
    const exp = 1_800_000_000
    expect(renewAtFor(tokenExpiringAt(exp), 0)).toBe(exp * 1000 - 5 * MINUTE)
  })

  it('assumes a short lifetime when exp cannot be read', () => {
    expect(renewAtFor('not-a-jwt', 1_000)).toBe(1_000 + 10 * MINUTE)
    expect(renewAtFor('a.!!!.c', 1_000)).toBe(1_000 + 10 * MINUTE)
  })
})

describe('createAccessTokenGetter', () => {
  const sixtyMinutesOut = (nowMs: number) => Math.floor(nowMs / 1000) + 3600

  it('mints once and reuses the token until it is close to expiry', async () => {
    let now = 1_000_000
    const mint = vi.fn(async () => tokenExpiringAt(sixtyMinutesOut(now)))
    const getToken = createAccessTokenGetter(mint, () => now)

    const first = await getToken()
    now += 30 * MINUTE
    const second = await getToken()

    expect(second).toBe(first)
    expect(mint).toHaveBeenCalledTimes(1)
  })

  it('mints again once the renewal point passes', async () => {
    let now = 1_000_000
    const mint = vi.fn(async () => tokenExpiringAt(sixtyMinutesOut(now)))
    const getToken = createAccessTokenGetter(mint, () => now)

    const first = await getToken()
    now += 56 * MINUTE
    const second = await getToken()

    expect(second).not.toBe(first)
    expect(mint).toHaveBeenCalledTimes(2)
  })

  it('shares one mint between concurrent callers', async () => {
    const mint = vi.fn(async () => tokenExpiringAt(sixtyMinutesOut(0)))
    const getToken = createAccessTokenGetter(mint, () => 0)

    const tokens = await Promise.all([getToken(), getToken(), getToken()])

    expect(new Set(tokens).size).toBe(1)
    expect(mint).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed mint', async () => {
    const mint = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce(tokenExpiringAt(sixtyMinutesOut(0)))
    const getToken = createAccessTokenGetter(mint, () => 0)

    await expect(getToken()).rejects.toThrow('rate limited')
    await expect(getToken()).resolves.toMatch(/^eyJ/)
    expect(mint).toHaveBeenCalledTimes(2)
  })
})
