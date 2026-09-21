import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import {
  migrationPreparationFailure,
  migrationPreparationMessage,
  runMigrationPreparationStage,
} from './migrationPreparationError'

const i18n = setupI18n({ locale: 'en', messages: { en: {} } })
const failure = (name: string, properties: Record<string, unknown> = {}) =>
  Object.assign(new Error('RPC secret payload 0xdeadbeef'), {
    name,
    ...properties,
  })
const message = (
  error: unknown,
  stage: Parameters<typeof migrationPreparationFailure>[1] = 'preflight',
) =>
  i18n._(migrationPreparationMessage(migrationPreparationFailure(error, stage)))

describe('migration preparation errors', () => {
  it.each([
    [
      'MigrationContractInvariantError',
      { invariant: 'missing-code' },
      'contract-unavailable',
    ],
    ['AccountVerificationError', { field: 'owner' }, 'account-mismatch'],
    [
      'AccountVerificationError',
      { field: 'implementation' },
      'contract-incompatible',
    ],
    [
      'MigrationContractInvariantError',
      { invariant: 'resolver-certification' },
      'contract-incompatible',
    ],
    [
      'LockedResolverRecordSafetyError',
      { reason: 'inventory-missing' },
      'records-unavailable',
    ],
    [
      'LockedResolverRecordSafetyError',
      { reason: 'records-not-replayable' },
      'records-not-replayable',
    ],
    ['ProfileFetchError', {}, 'records-unavailable'],
    ['MigrationRecoveryPlanError', {}, 'recovery-changed'],
    ['MigrationBatchJournalCorruptError', {}, 'recovery-changed'],
    ['HttpRequestError', {}, 'rpc-unavailable'],
    ['TimeoutError', {}, 'rpc-unavailable'],
    [
      'CopyMigrationReadinessError',
      { reason: 'read-failed' },
      'rpc-unavailable',
    ],
  ] as const)('classifies %s safely', (name, properties, reason) => {
    const cause = failure(name, properties)
    expect(migrationPreparationFailure(cause)).toEqual({
      stage: 'preflight',
      reason,
      cause,
    })
    expect(message(cause)).not.toMatch(/secret|deadbeef|network fee/)
  })

  it.each([
    'account',
    'preflight',
    'plan',
    'recovery',
    'fee',
  ] as const)('retains the %s stage and original diagnostic cause', async (stage) => {
    const cause = failure('HttpRequestError')
    const error = await runMigrationPreparationStage(stage, () =>
      Promise.reject(cause),
    ).catch((error: unknown) => error)
    expect(migrationPreparationFailure(error)).toEqual({
      stage,
      reason: stage === 'fee' ? 'fee-unavailable' : 'rpc-unavailable',
      cause,
    })
  })

  it('reserves the fee message for failed fee lookups', () => {
    const cause = failure('HttpRequestError')
    expect(message(cause, 'fee')).toBe("Couldn't estimate the network fee")
    expect(message(cause, 'preflight')).toBe(
      "Couldn't reach the network to prepare your upgrade. Please try again.",
    )
  })

  it('reports incomplete record inventory and recovery state separately', () => {
    expect(message(failure('ProfileFetchError'), 'plan')).toBe(
      "Couldn't verify your name records. Please try again.",
    )
    expect(message(failure('MigrationRecoveryPlanError'), 'recovery')).toBe(
      "Couldn't restore your upgrade progress. Reload to check the latest state.",
    )
  })

  it('does not leak raw account errors or unknown RPC payloads', () => {
    expect(message('raw account RPC data', 'account')).toBe(
      "Couldn't prepare your account. Reconnect your wallet and try again.",
    )
    expect(message(failure('UnexpectedError'), 'plan')).toBe(
      "Couldn't prepare your upgrade. Please try again.",
    )
  })

  it('reads nested causes and handles cyclic causes', () => {
    const cause = failure('AccountVerificationError', {
      field: 'authorizedOwner',
    })
    const error = failure('MigrationContractInvariantError', {
      invariant: 'hca-certification',
      cause,
    })
    expect(migrationPreparationFailure(error).reason).toBe('account-mismatch')
    const cyclic = failure('UnexpectedError')
    Object.assign(cyclic, { cause: cyclic })
    expect(migrationPreparationFailure(cyclic).reason).toBe('unknown')
  })

  it('returns successful stage results unchanged', async () => {
    const value = { plan: 'ready' }
    expect(
      await runMigrationPreparationStage('plan', () => Promise.resolve(value)),
    ).toBe(value)
  })
})
