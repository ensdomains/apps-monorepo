import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTelegramAuthorization,
  digestParameter,
  exchangeTelegramCode,
  TELEGRAM_ISSUER,
  verifyTelegramIdToken,
} from './oidc.js'

describe('Telegram OIDC', () => {
  let signingKey: CryptoKey
  let keys: ReturnType<typeof createLocalJWKSet>
  let jwks: Parameters<typeof createLocalJWKSet>[0]
  const clientId = '123456'
  const nonce = 'expected-nonce'
  const claims = () => ({
    iss: TELEGRAM_ISSUER,
    aud: clientId,
    sub: 'oidc-subject-not-chat-id',
    id: 987654321,
    nonce,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
  })
  const sign = (payload: Record<string, unknown>, key = signingKey) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .sign(key)

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true })
    signingKey = pair.privateKey
    jwks = {
      keys: [
        {
          ...(await exportJWK(pair.publicKey)),
          kid: 'test-key',
          alg: 'RS256',
          use: 'sig',
        },
      ],
    }
    keys = createLocalJWKSet(jwks)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('loads keys only from Telegram and ignores a token-supplied key URL', async () => {
    const fetchKeys = vi.fn(async (_input: RequestInfo | URL) =>
      Response.json(jwks),
    )
    vi.stubGlobal('fetch', fetchKeys)
    const token = await new SignJWT(claims())
      .setProtectedHeader({
        alg: 'RS256',
        kid: 'test-key',
        jku: 'https://attacker.example/keys',
      })
      .sign(signingKey)
    expect((await verifyTelegramIdToken(token, clientId, nonce)).isOk()).toBe(
      true,
    )
    expect(fetchKeys).toHaveBeenCalledOnce()
    expect(String(fetchKeys.mock.calls[0]?.[0])).toBe(
      `${TELEGRAM_ISSUER}/.well-known/jwks.json`,
    )
  })

  it('generates independent state, nonce and S256 PKCE, requesting bot access only', async () => {
    const first = (
      await createTelegramAuthorization(
        clientId,
        'https://api.example/callback',
      )
    )._unsafeUnwrap()
    const second = (
      await createTelegramAuthorization(
        clientId,
        'https://api.example/callback',
      )
    )._unsafeUnwrap()
    const url = new URL(first.authorizationUrl)
    expect(url.origin + url.pathname).toBe(`${TELEGRAM_ISSUER}/auth`)
    expect(url.searchParams.get('scope')).toBe(
      'openid profile telegram:bot_access',
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(
      (await digestParameter(first.codeVerifier))._unsafeUnwrap(),
    )
    expect(first.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(url.searchParams.get('nonce')).toBe(first.nonce)
    expect(
      (
        await digestParameter(url.searchParams.get('state') ?? '')
      )._unsafeUnwrap(),
    ).toBe(first.stateDigest)
    expect(first.stateDigest).not.toBe(second.stateDigest)
    expect(first.nonce).not.toBe(first.codeVerifier)
    expect(first.authorizationUrl).not.toContain(first.codeVerifier)
  })

  it('accepts a signed identity without a username and uses the numeric Bot API ID', async () => {
    const result = await verifyTelegramIdToken(
      await sign(claims()),
      clientId,
      nonce,
      keys,
    )
    expect(result._unsafeUnwrap()).toEqual({ id: 987654321 })
  })

  it('normalizes a signed decimal string Bot API ID', async () => {
    const result = await verifyTelegramIdToken(
      await sign({ ...claims(), id: '987654321' }),
      clientId,
      nonce,
      keys,
    )
    expect(result._unsafeUnwrap()).toEqual({ id: 987654321 })
  })

  it.each([
    ['issuer', { iss: 'https://attacker.example' }],
    ['audience', { aud: 'other-bot' }],
    ['expiry', { exp: Math.floor(Date.now() / 1000) - 60 }],
    ['future issued-at', { iat: Math.floor(Date.now() / 1000) + 60 }],
    ['nonce', { nonce: 'other-attempt' }],
    ['subject', { sub: '' }],
    ['subject type', { sub: 1234 }],
    ['missing Bot API ID', { id: undefined }],
    ['unsafe Bot API ID', { id: Number.MAX_SAFE_INTEGER + 1 }],
    ['invalid Bot API ID', { id: -1 }],
    ['empty Bot API ID', { id: '' }],
    ['whitespace Bot API ID', { id: ' 987654321 ' }],
    ['fractional Bot API ID', { id: '987.5' }],
    ['exponent Bot API ID', { id: '1e9' }],
    ['zero Bot API ID', { id: '0' }],
    ['negative string Bot API ID', { id: '-1' }],
    ['unsafe string Bot API ID', { id: '9007199254740993' }],
    ['authorized party', { azp: 'other-client' }],
    ['multiple audiences without azp', { aud: [clientId, 'other-client'] }],
    ['missing expiry', { exp: undefined }],
    ['missing issued-at', { iat: undefined }],
    ['missing nonce', { nonce: undefined }],
  ])('rejects invalid %s', async (_label, overrides) => {
    const result = await verifyTelegramIdToken(
      await sign({ ...claims(), ...overrides }),
      clientId,
      nonce,
      keys,
    )
    expect(result.isErr()).toBe(true)
  })

  it('rejects a signature from another key and unsigned/HS256 tokens', async () => {
    const other = await generateKeyPair('RS256')
    expect(
      (
        await verifyTelegramIdToken(
          await sign(claims(), other.privateKey),
          clientId,
          nonce,
          keys,
        )
      ).isErr(),
    ).toBe(true)
    const hmac = await new SignJWT(claims())
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new Uint8Array(32))
    expect(
      (await verifyTelegramIdToken(hmac, clientId, nonce, keys)).isErr(),
    ).toBe(true)
    expect(
      (
        await verifyTelegramIdToken(
          'eyJhbGciOiJub25lIn0.e30.',
          clientId,
          nonce,
          keys,
        )
      ).isErr(),
    ).toBe(true)
  })

  it('exchanges with Basic auth and the exact redirect URI and verifier, returning only the ID token', async () => {
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        // Exercise Workers' Request constructor: redirect: 'error' is unsupported.
        expect(new Request(input, init).redirect).toBe('manual')
        return Response.json({
          id_token: 'id-token',
          access_token: 'secret-access-token',
        })
      },
    )
    vi.stubGlobal('fetch', request)
    const result = await exchangeTelegramCode({
      clientId,
      clientSecret: 'secret',
      code: 'code',
      codeVerifier: 'verifier',
      redirectUri: 'https://api.example/callback',
    })
    expect(result._unsafeUnwrap()).toBe('id-token')
    expect(request).toHaveBeenCalledWith(
      `${TELEGRAM_ISSUER}/token`,
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: expect.objectContaining({
          Authorization: `Basic ${btoa(`${clientId}:secret`)}`,
        }),
      }),
    )
    const options = vi.mocked(fetch).mock.calls[0]?.[1]
    expect(String(options?.body)).toBe(
      'grant_type=authorization_code&code=code&client_id=123456&redirect_uri=https%3A%2F%2Fapi.example%2Fcallback&code_verifier=verifier',
    )
  })

  it('sanitizes provider and network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValue(
          new Error('https://secret:credential@provider/?code=private-code'),
        ),
    )
    const result = await exchangeTelegramCode({
      clientId,
      clientSecret: 'secret',
      code: 'code',
      codeVerifier: 'verifier',
      redirectUri: 'https://api.example/callback',
    })
    expect(result._unsafeUnwrapErr().message).toBe(
      'Telegram token exchange failed',
    )
    expect(result._unsafeUnwrapErr()).toMatchObject({
      _tag: 'TELEGRAM_TOKEN_EXCHANGE_ERROR',
      stage: 'request',
    })
    expect(result._unsafeUnwrapErr().cause).toBeInstanceOf(Error)
  })

  it('returns a typed failure when the runtime throws before returning a fetch promise', async () => {
    const cause = new TypeError('unsupported request option')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw cause
      }),
    )
    const result = await exchangeTelegramCode({
      clientId,
      clientSecret: 'secret',
      code: 'code',
      codeVerifier: 'verifier',
      redirectUri: 'https://api.example/callback',
    })
    expect(result._unsafeUnwrapErr()).toMatchObject({ stage: 'request', cause })
  })

  it('rejects token endpoint redirects without forwarding credentials', async () => {
    const request = vi.fn(
      async () =>
        new Response(null, {
          status: 307,
          headers: { Location: 'https://attacker.example/token' },
        }),
    )
    vi.stubGlobal('fetch', request)
    const result = await exchangeTelegramCode({
      clientId,
      clientSecret: 'secret',
      code: 'code',
      codeVerifier: 'verifier',
      redirectUri: 'https://api.example/callback',
    })
    expect(result._unsafeUnwrapErr()).toMatchObject({
      _tag: 'TELEGRAM_TOKEN_EXCHANGE_ERROR',
      stage: 'provider',
      status: 307,
    })
    expect(request).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith(
      `${TELEGRAM_ISSUER}/token`,
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it('retains a recognized OAuth error without echoing the provider response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            error: 'invalid_grant',
            error_description: 'private-code private-verifier',
          },
          { status: 400 },
        ),
      ),
    )
    const result = await exchangeTelegramCode({
      clientId,
      clientSecret: 'secret',
      code: 'private-code',
      codeVerifier: 'private-verifier',
      redirectUri: 'https://api.example/callback',
    })
    expect(result._unsafeUnwrapErr()).toMatchObject({
      stage: 'provider',
      status: 400,
      providerError: 'invalid_grant',
    })
    expect(result._unsafeUnwrapErr().message).not.toContain('private')
  })

  it.each([
    [
      'provider',
      () => new Response('private provider diagnostic', { status: 401 }),
      401,
    ],
    ['decode', () => new Response('not json', { status: 200 }), undefined],
    [
      'response',
      () => Response.json({ access_token: 'private-access-token' }),
      undefined,
    ],
  ] as const)(
    'distinguishes token exchange %s failures',
    async (stage, response, status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response()),
      )
      const result = await exchangeTelegramCode({
        clientId,
        clientSecret: 'secret',
        code: 'code',
        codeVerifier: 'verifier',
        redirectUri: 'https://api.example/callback',
      })
      expect(result._unsafeUnwrapErr()).toMatchObject({
        _tag: 'TELEGRAM_TOKEN_EXCHANGE_ERROR',
        stage,
        ...(status ? { status } : {}),
      })
      expect(result._unsafeUnwrapErr().message).not.toContain('private')
    },
  )

  it('returns typed crypto errors rather than rejecting', async () => {
    const cause = new Error('crypto unavailable')
    const digest = vi
      .spyOn(crypto.subtle, 'digest')
      .mockRejectedValueOnce(cause)
    const result = await digestParameter('state')
    expect(result._unsafeUnwrapErr()).toMatchObject({
      _tag: 'TELEGRAM_CRYPTO_ERROR',
      cause,
    })
    digest.mockRestore()
  })
})
