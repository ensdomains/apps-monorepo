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
      'MigrationContractInvariantError',
      { invariant: 'resolver-writer-roles' },
      'resolver-not-writable',
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
    [
      'DirectMigrationRouteError',
      { reason: 'missing-wrapper' },
      'parent-not-upgraded',
    ],
    ['DirectMigrationRouteError', { reason: 'conflicting-wrapper' }, 'unknown'],
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

  it('names the parent prerequisite when a grace renewal is in the selection', () => {
    const cause = failure('DirectMigrationRouteError', {
      reason: 'missing-wrapper',
      ensName: 'woiaf.eth',
    })
    const wrapped = failure('OuterError', { cause })
    expect(migrationPreparationFailure(wrapped, 'fee').reason).toBe(
      'parent-not-upgraded',
    )
    expect(message(wrapped, 'fee')).toBe(
      "Some subnames can't upgrade because woiaf.eth hasn't been upgraded yet. Upgrade this parent first, or deselect those subnames.",
    )
    expect(
      message(
        failure('DirectMigrationRouteError', { reason: 'missing-wrapper' }),
      ),
    ).toBe(
      "Some subnames can't upgrade until their parent name is upgraded. Upgrade the parent first, or deselect those subnames.",
    )
    expect(
      migrationPreparationFailure(failure('HttpRequestError'), 'fee').reason,
    ).toBe('fee-unavailable')
  })

  it.each(['account', 'preflight', 'plan', 'recovery', 'fee'] as const)(
    'retains the %s stage and original diagnostic cause',
    async (stage) => {
      const cause = failure('HttpRequestError')
      const error = await runMigrationPreparationStage(stage, () =>
        Promise.reject(cause),
      ).catch((error: unknown) => error)
      expect(migrationPreparationFailure(error)).toEqual({
        stage,
        reason: stage === 'fee' ? 'fee-unavailable' : 'rpc-unavailable',
        cause,
      })
    },
  )

  it.each(['plan', 'fee'] as const)(
    'identifies an oversized atomic tree during %s and names what to deselect',
    (stage) => {
      const cause = failure('AtomicMigrationNameGasLimitExceededError', {
        ensName: 'walletmail.eth',
        estimatedGas: 25_125_000n,
        maxOuterGas: 15_000_000n,
      })
      const wrapped = failure('OuterError', { cause })
      expect(migrationPreparationFailure(wrapped, stage).reason).toBe(
        'atomic-name-gas-limit',
      )
      expect(message(wrapped, stage)).toBe(
        'The estimated gas for walletmail.eth and its subnames exceeds the per-transaction limit. Deselect this name to upgrade the rest.',
      )
      expect(message(wrapped, stage)).not.toMatch(/secret|deadbeef/)
    },
  )

  it('keeps oversized-plan diagnostics private when the name is unavailable', () => {
    expect(message(failure('AtomicMigrationNameGasLimitExceededError'))).toBe(
      'The estimated gas for a name and its subnames exceeds the per-transaction limit. Deselect the name to upgrade the rest.',
    )
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

  it('names the lost resolver permission instead of a contract mismatch', () => {
    const lostRoles = failure('MigrationContractInvariantError', {
      invariant: 'resolver-writer-roles',
    })
    expect(message(lostRoles)).toBe(
      "Your wallet and your smart account both lost permission to update your names' records. Restore the permission in your profile, then try again.",
    )
  })

  it.each(['preflight', 'plan', 'recovery', 'fee'] as const)(
    'explains the locked resolver risk for the affected name during %s',
    (stage) => {
      const cause = failure('MigrationContractInvariantError', {
        invariant: 'locked-resolver-record-control',
        ensName: 'locked.eth',
      })
      const wrapped = failure('OuterError', { cause })
      expect(migrationPreparationFailure(wrapped, stage).reason).toBe(
        'locked-resolver-record-control',
      )
      expect(message(wrapped, stage)).toBe(
        'Upgrading locked.eth could make its records permanently uneditable because its resolver cannot be replaced. Deselect this name to continue.',
      )
      expect(message(wrapped, stage)).not.toMatch(/secret|deadbeef/)
    },
  )

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
