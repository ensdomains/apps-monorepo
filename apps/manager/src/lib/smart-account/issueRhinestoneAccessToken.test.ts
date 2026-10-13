import { exportJWK, generateKeyPair, jwtVerify } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConnectionCookie } from '@/lib/connection-cookie'
import {
  issueRhinestoneAccessToken,
  RhinestoneTokenError,
} from './issueRhinestoneAccessToken'

const { envMock, getRequestHeaderMock } = vi.hoisted(() => ({
  envMock: {} as Record<string, unknown>,
  getRequestHeaderMock: vi.fn<(name: string) => string | undefined>(),
}))

vi.mock('cloudflare:workers', () => ({ env: envMock }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (handler: () => Promise<string>) => handler,
  }),
}))

vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeader: getRequestHeaderMock,
}))

vi.mock('@/lib/connection-cookie', () => ({
  getConnectionCookie: vi.fn(),
}))

const WALLET = '0x1111111111111111111111111111111111111111'

const CREDENTIALS = {
  RHINESTONE_INTEGRATOR_ID: 'integrator-1',
  RHINESTONE_PROJECT_ID: 'project-1',
  RHINESTONE_APP_ID: 'app-1',
  RHINESTONE_KEY_ID: 'key-1',
}

const mint = () => issueRhinestoneAccessToken()

describe('issueRhinestoneAccessToken', () => {
  let publicKey: CryptoKey

  beforeEach(async () => {
    const pair = await generateKeyPair('ES256', { extractable: true })
    publicKey = pair.publicKey
    for (const key of Object.keys(envMock)) delete envMock[key]
    Object.assign(envMock, CREDENTIALS, {
      RHINESTONE_JWT_PRIVATE_KEY: JSON.stringify(
        await exportJWK(pair.privateKey),
      ),
    })
    vi.mocked(getConnectionCookie).mockReturnValue(WALLET)
    getRequestHeaderMock.mockImplementation((name) =>
      name === 'cf-connecting-ip' ? '203.0.113.7' : undefined,
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('mints an access token Rhinestone would accept from this project', async () => {
    const token = await mint()

    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      issuer: 'integrator-1',
      subject: 'project-1',
      audience: 'rhinestone-api',
    })
    expect(protectedHeader).toMatchObject({ alg: 'ES256', kid: 'key-1' })
    expect(payload).toMatchObject({ typ: 'access', app_id: 'app-1' })
    // Ten minutes: a whole registration with margin, and a sixth of the SDK
    // signer's hour, since a leaked token's lifetime is its only bound.
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(600)
  })

  it('issues the same claims the SDK signer would', async () => {
    const { createJwtSigner } = await import('@rhinestone/sdk/jwt-server')
    const reference = createJwtSigner({
      jwt: {
        privateKey: JSON.parse(envMock.RHINESTONE_JWT_PRIVATE_KEY as string),
        integratorId: CREDENTIALS.RHINESTONE_INTEGRATOR_ID,
        projectId: CREDENTIALS.RHINESTONE_PROJECT_ID,
        appId: CREDENTIALS.RHINESTONE_APP_ID,
        keyId: CREDENTIALS.RHINESTONE_KEY_ID,
      },
    })
    const theirs = await jwtVerify(await reference.accessToken(), publicKey)
    const ours = await jwtVerify(await mint(), publicKey)

    const { exp: _theirExp, iat: _theirIat, ...theirClaims } = theirs.payload
    const { exp: _ourExp, iat: _ourIat, ...ourClaims } = ours.payload
    expect(ourClaims).toEqual(theirClaims)
    expect(ours.protectedHeader).toEqual(theirs.protectedHeader)
  })

  it('refuses a key that is not P-256, which the dashboard never issues', async () => {
    const rsa = await generateKeyPair('RS256', { extractable: true })
    envMock.RHINESTONE_JWT_PRIVATE_KEY = JSON.stringify(
      await exportJWK(rsa.privateKey),
    )

    await expect(mint()).rejects.toMatchObject({
      reason: 'not-configured',
      message: expect.stringContaining('P-256'),
    })
  })

  it('never mints a sponsorship token', async () => {
    const { payload } = await jwtVerify(await mint(), publicKey)

    expect(payload).not.toHaveProperty('policy')
    expect(payload.typ).not.toBe('intent_extension')
  })

  it('refuses callers without a connected wallet, before touching the key', async () => {
    vi.mocked(getConnectionCookie).mockReturnValue(null)
    delete envMock.RHINESTONE_JWT_PRIVATE_KEY

    await expect(mint()).rejects.toMatchObject({
      _tag: 'RhinestoneTokenError',
      reason: 'no-wallet',
    })
  })

  it('refuses a cookie that is not an address', async () => {
    vi.mocked(getConnectionCookie).mockReturnValue('vitalik.eth')

    await expect(mint()).rejects.toMatchObject({ reason: 'no-wallet' })
  })

  it('refuses when a credential is missing, naming it without echoing it', async () => {
    delete envMock.RHINESTONE_APP_ID

    const error = await mint().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RhinestoneTokenError)
    expect(error).toMatchObject({
      reason: 'not-configured',
      message: 'Rhinestone token signing is not configured (RHINESTONE_APP_ID)',
    })
  })

  it('names every missing credential, so none-set and one-set read differently', async () => {
    for (const key of Object.keys(envMock)) delete envMock[key]

    await expect(mint()).rejects.toThrow(
      'Rhinestone token signing is not configured (RHINESTONE_JWT_PRIVATE_KEY, RHINESTONE_INTEGRATOR_ID, RHINESTONE_PROJECT_ID, RHINESTONE_APP_ID, RHINESTONE_KEY_ID)',
    )
  })

  it('refuses a private key that is not a JWK', async () => {
    envMock.RHINESTONE_JWT_PRIVATE_KEY = 'rs_definitely_not_a_jwk'

    await expect(mint()).rejects.toThrow(/not a JWK/)
  })

  it('rate-limits by network address and by wallet, in separate buckets', async () => {
    const limit = vi.fn(async () => ({ success: true }))
    envMock.RHINESTONE_TOKEN_RATE_LIMIT = { limit }

    await expect(mint()).resolves.toMatch(/^eyJ/)
    expect(limit).toHaveBeenCalledWith({ key: 'ip:203.0.113.7' })
    expect(limit).toHaveBeenCalledWith({
      key: `wallet:${WALLET.toLowerCase()}`,
    })
  })

  it('refuses when the address bucket is exhausted, whatever the wallet says', async () => {
    // The wallet is a client-set cookie: a caller rotating it must not get a
    // fresh budget. The address bucket is the one they cannot choose.
    const limit = vi.fn(async ({ key }: { key: string }) => ({
      success: !key.startsWith('ip:'),
    }))
    envMock.RHINESTONE_TOKEN_RATE_LIMIT = { limit }

    await expect(mint()).rejects.toMatchObject({ reason: 'rate-limited' })
  })

  it('refuses when the wallet bucket is exhausted', async () => {
    const limit = vi.fn(async ({ key }: { key: string }) => ({
      success: !key.startsWith('wallet:'),
    }))
    envMock.RHINESTONE_TOKEN_RATE_LIMIT = { limit }

    await expect(mint()).rejects.toMatchObject({ reason: 'rate-limited' })
  })

  it('mints normally under the limit, and without the binding', async () => {
    envMock.RHINESTONE_TOKEN_RATE_LIMIT = {
      limit: vi.fn(async () => ({ success: true })),
    }
    await expect(mint()).resolves.toMatch(/^eyJ/)

    delete envMock.RHINESTONE_TOKEN_RATE_LIMIT
    await expect(mint()).resolves.toMatch(/^eyJ/)
  })
})
