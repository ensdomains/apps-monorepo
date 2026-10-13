import { exportJWK, generateKeyPair, jwtVerify } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConnectionCookie } from '@/lib/connection-cookie'
import {
  issueRhinestoneAccessToken,
  RhinestoneTokenError,
} from './issueRhinestoneAccessToken'

const { envMock } = vi.hoisted(() => ({
  envMock: {} as Record<string, unknown>,
}))

vi.mock('cloudflare:workers', () => ({ env: envMock }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (handler: () => Promise<string>) => handler,
  }),
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
    // An hour, which is what the SDK signer issues; the client renews early.
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(3600)
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

  it('rate-limits per wallet when the binding is present', async () => {
    const limit = vi.fn(async () => ({ success: false }))
    envMock.RHINESTONE_TOKEN_RATE_LIMIT = { limit }

    await expect(mint()).rejects.toMatchObject({ reason: 'rate-limited' })
    expect(limit).toHaveBeenCalledWith({ key: WALLET.toLowerCase() })
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
