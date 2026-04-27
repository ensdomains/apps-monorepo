import { describe, expect, it } from 'vitest'
import {
  decodeMigrationError,
  extractErrorMessage,
} from './decodeMigrationError'
import { OwnedResolverDeployError } from './ensureOwnedPermRes'
import { ProfileFetchError } from './fetchV1Profiles'

describe('extractErrorMessage', () => {
  it.each([
    ['plain string', 'plain string'],
    [42, '42'],
    [null, 'null'],
    [undefined, 'undefined'],
    [new Error('boom'), 'boom'],
    [new Error(''), 'Migration failed'],
  ])('%s → %s', (input, expected) => {
    expect(extractErrorMessage(input)).toBe(expected)
  })

  it('prefers shortMessage on the outer error', () => {
    const err = Object.assign(new Error('long'), { shortMessage: 'short' })
    expect(extractErrorMessage(err)).toBe('short')
  })

  it('prefers shortMessage on the deepest cause', () => {
    const deepest = Object.assign(new Error('deep long'), {
      shortMessage: 'deep short',
    })
    const outer = new Error('outer', {
      cause: new Error('middle', { cause: deepest }),
    })
    expect(extractErrorMessage(outer)).toBe('deep short')
  })

  it('unwraps to the deepest cause message when no shortMessage exists', () => {
    const outer = new Error('outer', {
      cause: new Error('middle', { cause: new Error('root cause') }),
    })
    expect(extractErrorMessage(outer)).toBe('root cause')
  })

  it('stops unwrapping at a non-Error cause', () => {
    const outer = new Error('outer')
    ;(outer as Error & { cause: unknown }).cause = { not: 'an error' }
    expect(extractErrorMessage(outer)).toBe('outer')
  })
})

describe('decodeMigrationError — direct mappings', () => {
  it.each([
    [
      'OwnedResolverDeployError → resolver-deploy-failed',
      new OwnedResolverDeployError({
        cause: new Error('deployProxy reverted'),
      }),
      { type: 'resolver-deploy-failed', message: 'deployProxy reverted' },
    ],
    [
      'ProfileFetchError subgraph',
      new ProfileFetchError({
        cause: new Error('subgraph 500'),
        phase: 'subgraph',
      }),
      {
        type: 'profile-fetch-failed',
        phase: 'subgraph',
        message: 'subgraph 500',
      },
    ],
    [
      'ProfileFetchError onchain',
      new ProfileFetchError({
        cause: new Error('rpc timeout'),
        phase: 'onchain',
      }),
      {
        type: 'profile-fetch-failed',
        phase: 'onchain',
        message: 'rpc timeout',
      },
    ],
    [
      'unknown Error → generic',
      new Error('surprise'),
      {
        type: 'generic',
        message: 'surprise',
      },
    ],
    [
      'non-Error → generic',
      'string error',
      {
        type: 'generic',
        message: 'string error',
      },
    ],
    [
      'viem-shaped error uses shortMessage',
      Object.assign(new Error('long viem message'), {
        shortMessage: 'User rejected the request.',
      }),
      { type: 'generic', message: 'User rejected the request.' },
    ],
  ] as const)('%s', (_, err, expected) => {
    expect(decodeMigrationError(err)).toEqual(expected)
  })
})

describe('decodeMigrationError — user rejection', () => {
  it('maps UserRejectedRequestError by .name', () => {
    const err = Object.assign(new Error('denied'), {
      name: 'UserRejectedRequestError',
    })
    expect(decodeMigrationError(err)).toEqual({ type: 'user-rejected' })
  })

  it('maps a rejection wrapped in a cause chain', () => {
    const rejection = Object.assign(new Error('Request rejected'), {
      name: 'UserRejectedRequestError',
    })
    const outer = new Error('outer', {
      cause: new Error('middle', { cause: rejection }),
    })
    expect(decodeMigrationError(outer)).toEqual({ type: 'user-rejected' })
  })

  it('maps errors whose message contains "user rejected"', () => {
    expect(
      decodeMigrationError(new Error('MetaMask Tx Signature: user rejected')),
    ).toEqual({ type: 'user-rejected' })
  })
})

describe('decodeMigrationError — preflight timeout', () => {
  const preflightTimeout = (message: string, timeoutMs: number) =>
    Object.assign(new Error(message), {
      name: 'PreflightTimeoutError',
      timeoutMs,
    })

  it('maps PreflightTimeoutError to preflight-timeout with timeoutMs', () => {
    const err = preflightTimeout(
      'Pre-flight RPC call timed out after 15000ms',
      15000,
    )
    expect(decodeMigrationError(err)).toEqual({
      type: 'preflight-timeout',
      message: 'Pre-flight RPC call timed out after 15000ms',
      timeoutMs: 15000,
    })
  })

  it('finds PreflightTimeoutError wrapped deep in a cause chain', () => {
    const outer = new Error('preflight failed', {
      cause: preflightTimeout('timed out', 5000),
    })
    expect(decodeMigrationError(outer)).toEqual({
      type: 'preflight-timeout',
      message: 'timed out',
      timeoutMs: 5000,
    })
  })

  it('user-rejection takes precedence over preflight-timeout', () => {
    const rejection = Object.assign(new Error('user rejected'), {
      name: 'UserRejectedRequestError',
      cause: preflightTimeout('timed out', 5000),
    })
    expect(decodeMigrationError(rejection)).toEqual({ type: 'user-rejected' })
  })
})
