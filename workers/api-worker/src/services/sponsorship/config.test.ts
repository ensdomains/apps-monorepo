import { describe, expect, it } from 'vitest'
import { buildRhinestoneJwtConfig } from './config'

const makeEnv = (overrides: Record<string, string> = {}): CloudflareBindings =>
  ({
    RHINESTONE_INTEGRATOR_ID: 'int_1',
    RHINESTONE_PROJECT_ID: 'proj_1',
    RHINESTONE_APP_ID: 'app_1',
    RHINESTONE_JWT_ACTIVE_KEY_ID: 'key-a',
    RHINESTONE_JWT_AUDIENCE: '',
    RHINESTONE_SPONSORSHIP_CHAIN_IDS: '11155111',
    RHINESTONE_JWT_SIGNING_KEYS: JSON.stringify([
      {
        keyId: 'key-a',
        privateKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' },
      },
      {
        keyId: 'key-b',
        privateKey: { kty: 'EC', crv: 'P-256', x: 'x2', y: 'y2', d: 'd2' },
      },
    ]),
    ...overrides,
  }) as unknown as CloudflareBindings

describe('buildRhinestoneJwtConfig', () => {
  it('selects the active signing key and assembles credentials', () => {
    const result = buildRhinestoneJwtConfig(makeEnv())
    expect(result.isOk()).toBe(true)
    if (!result.isOk()) return
    expect(result.value.jwt.keyId).toBe('key-a')
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

  it('errors when a required config value is blank', () => {
    const result = buildRhinestoneJwtConfig(
      makeEnv({ RHINESTONE_INTEGRATOR_ID: '' }),
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
