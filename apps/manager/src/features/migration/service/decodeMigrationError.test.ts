import { describe, expect, it } from 'vitest'
import {
  decodeMigrationError,
  extractErrorMessage,
} from './decodeMigrationError'
import { OwnedResolverDeployError } from './ensureOwnedPermRes'
import { ProfileFetchError } from './fetchV1Profiles'

describe('extractErrorMessage', () => {
  it('returns String(err) for non-Error values', () => {
    expect(extractErrorMessage('plain string')).toBe('plain string')
    expect(extractErrorMessage(42)).toBe('42')
    expect(extractErrorMessage(null)).toBe('null')
    expect(extractErrorMessage(undefined)).toBe('undefined')
  })

  it('returns the error message for a plain Error', () => {
    expect(extractErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('falls back to "Migration failed" when message is empty', () => {
    expect(extractErrorMessage(new Error(''))).toBe('Migration failed')
  })

  it('prefers shortMessage on the outer error', () => {
    const err = Object.assign(new Error('long message'), {
      shortMessage: 'short',
    })
    expect(extractErrorMessage(err)).toBe('short')
  })

  it('prefers shortMessage on the deepest cause', () => {
    const deepest = Object.assign(new Error('deep long'), {
      shortMessage: 'deep short',
    })
    const middle = new Error('middle', { cause: deepest })
    const outer = new Error('outer', { cause: middle })
    expect(extractErrorMessage(outer)).toBe('deep short')
  })

  it('unwraps to the deepest cause message when no shortMessage exists', () => {
    const deepest = new Error('root cause')
    const middle = new Error('middle', { cause: deepest })
    const outer = new Error('outer', { cause: middle })
    expect(extractErrorMessage(outer)).toBe('root cause')
  })

  it('stops unwrapping at a non-Error cause', () => {
    const outer = new Error('outer')
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
    ;(outer as any).cause = { not: 'an error' }
    expect(extractErrorMessage(outer)).toBe('outer')
  })
})

describe('decodeMigrationError', () => {
  it('maps OwnedResolverDeployError to resolver-deploy-failed', () => {
    const err = new OwnedResolverDeployError({
      cause: new Error('deployProxy reverted'),
    })
    expect(decodeMigrationError(err)).toEqual({
      type: 'resolver-deploy-failed',
      message: 'deployProxy reverted',
    })
  })

  it('maps ProfileFetchError with subgraph phase', () => {
    const err = new ProfileFetchError({
      cause: new Error('subgraph 500'),
      phase: 'subgraph',
    })
    expect(decodeMigrationError(err)).toEqual({
      type: 'profile-fetch-failed',
      phase: 'subgraph',
      message: 'subgraph 500',
    })
  })

  it('maps ProfileFetchError with onchain phase', () => {
    const err = new ProfileFetchError({
      cause: new Error('rpc timeout'),
      phase: 'onchain',
    })
    expect(decodeMigrationError(err)).toEqual({
      type: 'profile-fetch-failed',
      phase: 'onchain',
      message: 'rpc timeout',
    })
  })

  it('maps unknown errors to generic', () => {
    expect(decodeMigrationError(new Error('surprise'))).toEqual({
      type: 'generic',
      message: 'surprise',
    })
  })

  it('maps non-Error values to generic', () => {
    expect(decodeMigrationError('string error')).toEqual({
      type: 'generic',
      message: 'string error',
    })
  })

  it('uses shortMessage from viem-shaped errors', () => {
    const viemLike = Object.assign(new Error('long viem message'), {
      shortMessage: 'User rejected the request.',
    })
    expect(decodeMigrationError(viemLike)).toEqual({
      type: 'generic',
      message: 'User rejected the request.',
    })
  })
})
