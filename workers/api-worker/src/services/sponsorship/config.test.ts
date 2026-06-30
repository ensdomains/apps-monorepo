import { describe, expect, it } from 'vitest'
import { buildRhinestoneJwtConfig } from './config'

// Distinct private-key material per key id, so a selection bug that returns the
// wrong key's `privateKey` (not just the wrong `keyId`) is caught.
const KEY_A_PRIVATE = { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' }
const KEY_B_PRIVATE = { kty: 'EC', crv: 'P-256', x: 'x2', y: 'y2', d: 'd2' }

const makeEnv = (overrides: Record<string, string> = {}): CloudflareBindings =>
  ({
    RHINESTONE_INTEGRATOR_ID: 'int_1',
    RHINESTONE_PROJECT_ID: 'proj_1',
    RHINESTONE_APP_ID: 'app_1',
    RHINESTONE_JWT_ACTIVE_KEY_ID: 'key-a',
    RHINESTONE_JWT_AUDIENCE: '',
    RHINESTONE_SPONSORSHIP_CHAIN_IDS: '11155111',
    RHINESTONE_JWT_SIGNING_KEYS: JSON.stringify([
      { keyId: 'key-a', privateKey: KEY_A_PRIVATE },
      { keyId: 'key-b', privateKey: KEY_B_PRIVATE },
    ]),
    ...overrides,
  }) as unknown as CloudflareBindings

describe('buildRhinestoneJwtConfig', () => {
  it('selects the active signing key and assembles credentials', () => {
    const result = buildRhinestoneJwtConfig(makeEnv())
    expect(result.isOk()).toBe(true)
    if (!result.isOk()) return
    expect(result.value.jwt.keyId).toBe('key-a')
    expect(result.value.jwt.privateKey).toEqual(KEY_A_PRIVATE)
    expect(result.value.jwt.integratorId).toBe('int_1')
    expect(result.value.jwt.projectId).toBe('proj_1')
    expect(result.value.jwt.appId).toBe('app_1')
  })

  it('rotates by active key id without touching the key set', () => {
    const result = buildRhinestoneJwtConfig(
      makeEnv({ RHINESTONE_JWT_ACTIVE_KEY_ID: 'key-b' }),
    )
    if (!result.isOk()) throw new Error('expected ok')
    expect(result.value.jwt.keyId).toBe('key-b')
    // The paired material must rotate too — not just the id.
    expect(result.value.jwt.privateKey).toEqual(KEY_B_PRIVATE)
  })

  it('omits audience when blank so the SDK default applies', () => {
    const result = buildRhinestoneJwtConfig(makeEnv())
    if (!result.isOk()) throw new Error('expected ok')
    expect(result.value.jwt.audience).toBeUndefined()
  })

  it('keeps a configured audience', () => {
    const result = buildRhinestoneJwtConfig(
      makeEnv({ RHINESTONE_JWT_AUDIENCE: 'custom-aud' }),
    )
    if (!result.isOk()) throw new Error('expected ok')
    expect(result.value.jwt.audience).toBe('custom-aud')
  })

  it('errors when the signing keys json is invalid', () => {
    const result = buildRhinestoneJwtConfig(
      makeEnv({ RHINESTONE_JWT_SIGNING_KEYS: '{not json' }),
    )
    expect(result.isErr()).toBe(true)
    if (result.isErr())
      expect(result.error._tag).toBe('RHINESTONE_JWT_CONFIG_ERROR')
  })

  it('errors when the active key id is not in the key set', () => {
    const result = buildRhinestoneJwtConfig(
      makeEnv({ RHINESTONE_JWT_ACTIVE_KEY_ID: 'missing' }),
    )
    expect(result.isErr()).toBe(true)
    if (result.isErr())
      expect(result.error._tag).toBe('RHINESTONE_JWT_CONFIG_ERROR')
  })

  it('falls back to the baked-in identity when integrator/project/app are unset', () => {
    const result = buildRhinestoneJwtConfig(
      makeEnv({
        RHINESTONE_INTEGRATOR_ID: '',
        RHINESTONE_PROJECT_ID: '',
        RHINESTONE_APP_ID: '',
      }),
    )
    if (!result.isOk()) throw new Error('expected ok')
    expect(result.value.jwt.integratorId).toBe('app')
    expect(result.value.jwt.projectId).toBe('cmgk24o77001v3j0tkscm3a65')
    expect(result.value.jwt.appId).toBe('ens-manager-sepolia')
  })

  it('uses the sole signing key when no active key id is set', () => {
    const result = buildRhinestoneJwtConfig(
      makeEnv({
        RHINESTONE_JWT_ACTIVE_KEY_ID: '',
        RHINESTONE_JWT_SIGNING_KEYS: JSON.stringify([
          {
            keyId: 'only',
            privateKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' },
          },
        ]),
      }),
    )
    if (!result.isOk()) throw new Error('expected ok')
    expect(result.value.jwt.keyId).toBe('only')
    expect(result.value.jwt.privateKey).toEqual({
      kty: 'EC',
      crv: 'P-256',
      x: 'x',
      y: 'y',
      d: 'd',
    })
  })

  it('errors when several keys are set without an active key id', () => {
    const result = buildRhinestoneJwtConfig(
      makeEnv({ RHINESTONE_JWT_ACTIVE_KEY_ID: '' }),
    )
    expect(result.isErr()).toBe(true)
    if (result.isErr())
      expect(result.error._tag).toBe('RHINESTONE_JWT_CONFIG_ERROR')
  })

  it('errors when the key set is empty', () => {
    const result = buildRhinestoneJwtConfig(
      makeEnv({ RHINESTONE_JWT_SIGNING_KEYS: '[]' }),
    )
    expect(result.isErr()).toBe(true)
    if (result.isErr())
      expect(result.error._tag).toBe('RHINESTONE_JWT_CONFIG_ERROR')
  })

  it('rejects a public-only key (missing private scalar d)', () => {
    const result = buildRhinestoneJwtConfig(
      makeEnv({
        RHINESTONE_JWT_SIGNING_KEYS: JSON.stringify([
          {
            keyId: 'key-a',
            privateKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
          },
        ]),
      }),
    )
    expect(result.isErr()).toBe(true)
    if (result.isErr())
      expect(result.error._tag).toBe('RHINESTONE_JWT_CONFIG_ERROR')
  })

  it('rejects a non-P-256 curve', () => {
    const result = buildRhinestoneJwtConfig(
      makeEnv({
        RHINESTONE_JWT_SIGNING_KEYS: JSON.stringify([
          {
            keyId: 'key-a',
            privateKey: { kty: 'EC', crv: 'P-384', x: 'x', y: 'y', d: 'd' },
          },
        ]),
      }),
    )
    expect(result.isErr()).toBe(true)
    if (result.isErr())
      expect(result.error._tag).toBe('RHINESTONE_JWT_CONFIG_ERROR')
  })
})
