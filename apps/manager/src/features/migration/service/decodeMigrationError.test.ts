import { encodeErrorResult, type Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  LIB_MIGRATION_ERRORS_ABI,
  MIGRATION_HELPER_ABI,
} from '../contracts/abis'
import {
  decodeMigrationError,
  extractErrorMessage,
} from './decodeMigrationError'
import { OwnedResolverDeployError } from './ensureOwnedPermRes'
import { ProfileFetchError } from './fetchV1Profiles'

const revertWith = (data: Hex) =>
  Object.assign(new Error('reverted'), {
    name: 'ContractFunctionRevertedError',
    data,
  })

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

describe('decodeMigrationError — helper-typed reverts', () => {
  it('maps WrappedOwnerMismatch', () => {
    const data = encodeErrorResult({
      abi: MIGRATION_HELPER_ABI,
      errorName: 'WrappedOwnerMismatch',
      args: [42n],
    })
    expect(decodeMigrationError(revertWith(data))).toEqual({
      type: 'wrapped-owner-mismatch',
      tokenId: 42n,
    })
  })

  it('maps ParentNotMigrated and decodes the DNS-encoded name to a human-readable string', () => {
    // DNS-encoded 'vault.eth': 0x05 + 'vault' + 0x03 + 'eth' + 0x00
    const dnsEncoded = '0x057661756c740365746800' as Hex
    const data = encodeErrorResult({
      abi: MIGRATION_HELPER_ABI,
      errorName: 'ParentNotMigrated',
      args: [dnsEncoded],
    })
    const result = decodeMigrationError(revertWith(data))
    expect(result.type).toBe('parent-not-migrated')
    if (result.type === 'parent-not-migrated') {
      expect(result.parentName).toBe('vault.eth')
    }
  })

  it('maps NotApprovedOperator', () => {
    const data = encodeErrorResult({
      abi: MIGRATION_HELPER_ABI,
      errorName: 'NotApprovedOperator',
      args: [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ],
    })
    expect(decodeMigrationError(revertWith(data))).toEqual({
      type: 'not-approved-operator',
      nft: '0x1111111111111111111111111111111111111111',
      owner: '0x2222222222222222222222222222222222222222',
    })
  })
})

describe('decodeMigrationError — wrapped LibMigration errors', () => {
  // WrappedErrorLib serializes the inner revert by encoding the original revert
  // data (selector + abi args) into the Error(string) payload. The decoder must
  // unwrap Error(string), interpret the inner string as hex bytes, and decode
  // against LIB_MIGRATION_ERRORS_ABI.
  const wrap = (inner: Hex): Hex =>
    encodeErrorResult({
      abi: [
        { type: 'error', name: 'Error', inputs: [{ type: 'string' }] },
      ] as const,
      errorName: 'Error',
      args: [inner],
    })

  it('unwraps NameNotLocked', () => {
    const inner = encodeErrorResult({
      abi: LIB_MIGRATION_ERRORS_ABI,
      errorName: 'NameNotLocked',
      args: [7n],
    })
    expect(decodeMigrationError(revertWith(wrap(inner)))).toEqual({
      type: 'name-not-locked',
      tokenId: 7n,
    })
  })

  it('unwraps FrozenTokenApproval', () => {
    const inner = encodeErrorResult({
      abi: LIB_MIGRATION_ERRORS_ABI,
      errorName: 'FrozenTokenApproval',
      args: [9n],
    })
    expect(decodeMigrationError(revertWith(wrap(inner)))).toEqual({
      type: 'frozen-token-approval',
      tokenId: 9n,
    })
  })

  it('unwraps NameIsLocked', () => {
    const inner = encodeErrorResult({
      abi: LIB_MIGRATION_ERRORS_ABI,
      errorName: 'NameIsLocked',
      args: [11n],
    })
    expect(decodeMigrationError(revertWith(wrap(inner)))).toEqual({
      type: 'name-is-locked',
      tokenId: 11n,
    })
  })

  it('unwraps NameDataMismatch', () => {
    const inner = encodeErrorResult({
      abi: LIB_MIGRATION_ERRORS_ABI,
      errorName: 'NameDataMismatch',
      args: [13n],
    })
    expect(decodeMigrationError(revertWith(wrap(inner)))).toEqual({
      type: 'name-data-mismatch',
      tokenId: 13n,
    })
  })

  it('unwraps InvalidData (no args)', () => {
    const inner = encodeErrorResult({
      abi: LIB_MIGRATION_ERRORS_ABI,
      errorName: 'InvalidData',
    })
    expect(decodeMigrationError(revertWith(wrap(inner)))).toEqual({
      type: 'invalid-data',
    })
  })

  it('unwraps NameRequiresMigration (no args)', () => {
    const inner = encodeErrorResult({
      abi: LIB_MIGRATION_ERRORS_ABI,
      errorName: 'NameRequiresMigration',
    })
    expect(decodeMigrationError(revertWith(wrap(inner)))).toEqual({
      type: 'name-requires-migration',
    })
  })

  it('falls through to generic when wrapped data is unrecognized', () => {
    const garbage = '0xdeadbeef' as Hex
    const result = decodeMigrationError(revertWith(wrap(garbage)))
    expect(result.type).toBe('generic')
  })
})

describe('decodeMigrationError — on-chain Error(string) raw-bytes wrap', () => {
  // Matches NameWrapper's actual rewrap: revert(string(abi.encodePacked(returnData)))
  // — the inner revert bytes are packed into the string payload verbatim.
  const wrapRaw = (inner: Hex): Hex => {
    const innerBytes = inner.slice(2)
    const length = innerBytes.length / 2
    const lengthHex = length.toString(16).padStart(64, '0')
    const paddedBytes = innerBytes.padEnd(
      Math.ceil(innerBytes.length / 64) * 64,
      '0',
    )
    return `0x08c379a00000000000000000000000000000000000000000000000000000000000000020${lengthHex}${paddedBytes}` as Hex
  }

  it('unwraps NameNotLocked from raw-bytes-as-string Error wrap', () => {
    const inner = encodeErrorResult({
      abi: LIB_MIGRATION_ERRORS_ABI,
      errorName: 'NameNotLocked',
      args: [42n],
    })
    expect(decodeMigrationError(revertWith(wrapRaw(inner)))).toEqual({
      type: 'name-not-locked',
      tokenId: 42n,
    })
  })

  it('unwraps FrozenTokenApproval from raw-bytes-as-string Error wrap', () => {
    const inner = encodeErrorResult({
      abi: LIB_MIGRATION_ERRORS_ABI,
      errorName: 'FrozenTokenApproval',
      args: [99n],
    })
    expect(decodeMigrationError(revertWith(wrapRaw(inner)))).toEqual({
      type: 'frozen-token-approval',
      tokenId: 99n,
    })
  })

  it('unwraps InvalidData (no args) from raw-bytes-as-string Error wrap', () => {
    const inner = encodeErrorResult({
      abi: LIB_MIGRATION_ERRORS_ABI,
      errorName: 'InvalidData',
    })
    expect(decodeMigrationError(revertWith(wrapRaw(inner)))).toEqual({
      type: 'invalid-data',
    })
  })

  it('unwraps NameRequiresMigration (no args) from raw-bytes-as-string Error wrap', () => {
    const inner = encodeErrorResult({
      abi: LIB_MIGRATION_ERRORS_ABI,
      errorName: 'NameRequiresMigration',
    })
    expect(decodeMigrationError(revertWith(wrapRaw(inner)))).toEqual({
      type: 'name-requires-migration',
    })
  })
})
