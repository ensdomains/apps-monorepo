import { beforeAll, describe, expect, it } from 'vitest'
import app from './index'

// A real EC P-256 JWK so the Rhinestone signer can actually sign (ES256).
let signingKeysJson: string

beforeAll(async () => {
  const generated = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  if (!('privateKey' in generated)) throw new Error('expected a key pair')
  const jwk = await crypto.subtle.exportKey('jwk', generated.privateKey)
  signingKeysJson = JSON.stringify([{ keyId: 'key-test', privateKey: jwk }])
})

const makeEnv = (overrides: Record<string, string> = {}): CloudflareBindings =>
  ({
    RHINESTONE_INTEGRATOR_ID: 'int_test',
    RHINESTONE_PROJECT_ID: 'proj_test',
    RHINESTONE_APP_ID: 'app_test',
    RHINESTONE_JWT_ACTIVE_KEY_ID: 'key-test',
    RHINESTONE_JWT_AUDIENCE: '',
    RHINESTONE_SPONSORSHIP_CHAIN_IDS: '11155111',
    RHINESTONE_JWT_SIGNING_KEYS: signingKeysJson,
    ...overrides,
  }) as unknown as CloudflareBindings

const intentInput = (chainId: number) => ({
  destinationChainId: chainId,
  account: { address: '0x1111111111111111111111111111111111111111' },
  destinationExecutions: [
    {
      to: '0x2222222222222222222222222222222222222222',
      value: '0',
      data: '0x',
    },
  ],
})

const postJson = (path: string, body: unknown, env: CloudflareBindings) =>
  app.request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  )

describe('sponsorship JWT routes', () => {
  it('mints an access token (JWS with three segments)', async () => {
    const res = await app.request(
      '/sponsorship/access-token',
      { method: 'POST' },
      makeEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string }
    expect(body.token.split('.')).toHaveLength(3)
  })

  it('mints an extension token for an allowlisted chain', async () => {
    const res = await postJson(
      '/sponsorship/extension-token',
      { intentInput: intentInput(11155111) },
      makeEnv(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string }
    expect(body.token.split('.')).toHaveLength(3)
  })

  it('denies sponsorship for a non-allowlisted chain (403)', async () => {
    const res = await postJson(
      '/sponsorship/extension-token',
      { intentInput: intentInput(1) },
      makeEnv(),
    )
    expect(res.status).toBe(403)
  })

  it('rejects a body without intentInput (400)', async () => {
    const res = await postJson('/sponsorship/extension-token', {}, makeEnv())
    expect(res.status).toBe(400)
  })

  it('rejects a malformed-but-present intentInput (400)', async () => {
    const res = await postJson(
      '/sponsorship/extension-token',
      {
        intentInput: {
          // destinationChainId missing
          account: { address: '0x1111111111111111111111111111111111111111' },
          destinationExecutions: [],
        },
      },
      makeEnv(),
    )
    expect(res.status).toBe(400)
  })

  it('denies every chain when the allowlist is empty (403)', async () => {
    const res = await postJson(
      '/sponsorship/extension-token',
      { intentInput: intentInput(11155111) },
      makeEnv({ RHINESTONE_SPONSORSHIP_CHAIN_IDS: '' }),
    )
    expect(res.status).toBe(403)
  })

  it('returns 500 when the signer config is invalid', async () => {
    const res = await app.request(
      '/sponsorship/access-token',
      { method: 'POST' },
      makeEnv({ RHINESTONE_JWT_SIGNING_KEYS: 'not-json' }),
    )
    expect(res.status).toBe(500)
  })
})
