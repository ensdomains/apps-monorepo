import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { SubnameRecreationError } from './subnameRecreationError'

type MigrationPreparationStage =
  | 'account'
  | 'preflight'
  | 'plan'
  | 'recovery'
  | 'fee'
type MigrationPreparationReason =
  | 'account-unavailable'
  | 'account-mismatch'
  | 'contract-unavailable'
  | 'contract-incompatible'
  | 'resolver-not-writable'
  | 'locked-resolver-record-control'
  | 'legacy-resolver-content'
  | 'unsupported-resolver-records'
  | 'records-unavailable'
  | 'records-not-replayable'
  | 'recovery-changed'
  | 'parent-not-upgraded'
  | 'reservation-not-synced'
  | 'rpc-unavailable'
  | 'fee-unavailable'
  | 'unknown'

class MigrationPreparationError extends TaggedError(
  'MigrationPreparationError',
)<{
  readonly stage: MigrationPreparationStage
  readonly cause: unknown
}> {}

export type MigrationPreparationFailure = {
  readonly stage: MigrationPreparationStage
  readonly reason: MigrationPreparationReason
  readonly cause: unknown
}

const causeChain = (error: unknown): readonly Record<string, unknown>[] => {
  const chain: Record<string, unknown>[] = []
  const seen = new Set<unknown>()
  let current = error
  while (
    typeof current === 'object' &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current)
    const value = current as Record<string, unknown>
    chain.push(value)
    current = value.cause
  }
  return chain
}

const reasonFor = (
  stage: MigrationPreparationStage,
  cause: unknown,
): MigrationPreparationReason => {
  const chain = causeChain(cause)
  if (
    chain.some(
      (error) =>
        error.name === 'CopyMigrationReadinessError' &&
        error.reason === 'reservation-expiry-mismatch',
    )
  )
    return 'reservation-not-synced'
  // Before the fee fallback: the grace renewal estimate checks routes under the fee stage.
  if (
    chain.some(
      (error) =>
        error.name === 'DirectMigrationRouteError' &&
        error.reason === 'missing-wrapper',
    )
  )
    return 'parent-not-upgraded'
  if (
    chain.some(
      (error) =>
        error.name === 'MigrationContractInvariantError' &&
        error.invariant === 'locked-resolver-record-control',
    )
  )
    return 'locked-resolver-record-control'
  if (chain.some((error) => error.name === 'LegacyResolverContentError'))
    return 'legacy-resolver-content'
  if (chain.some((error) => error.name === 'UnsupportedResolverRecordsError'))
    return 'unsupported-resolver-records'
  if (stage === 'fee') return 'fee-unavailable'
  if (
    chain.some(
      (error) =>
        error.name === 'AccountVerificationError' &&
        (error.field === 'owner' ||
          error.field === 'authorizedOwner' ||
          error.field === 'accountId'),
    )
  )
    return 'account-mismatch'
  if (
    chain.some(
      (error) =>
        error.name === 'MigrationContractInvariantError' &&
        error.invariant === 'missing-code',
    )
  )
    return 'contract-unavailable'
  // Neither account can write the resolver's records, so the upgrade cannot
  // preserve them. This is a permissions problem, not a contract mismatch.
  if (
    chain.some(
      (error) =>
        error.name === 'MigrationContractInvariantError' &&
        error.invariant === 'resolver-writer-roles',
    )
  )
    return 'resolver-not-writable'
  if (
    chain.some(
      (error) =>
        error.name === 'LockedResolverRecordSafetyError' &&
        error.reason === 'records-not-replayable',
    )
  )
    return 'records-not-replayable'
  if (
    chain.some(
      (error) =>
        error.name === 'LockedResolverRecordSafetyError' ||
        error.name === 'ProfileFetchError',
    )
  )
    return 'records-unavailable'
  if (
    chain.some(
      (error) =>
        error.name === 'MigrationRecoveryPlanError' ||
        error.name === 'MigrationBatchJournalCorruptError' ||
        error.name === 'MigrationBatchJournalUnavailableError',
    )
  )
    return 'recovery-changed'
  if (
    chain.some(
      (error) =>
        [
          'HttpRequestError',
          'TimeoutError',
          'RpcRequestError',
          'SocketClosedError',
          'WebSocketRequestError',
          'PreflightTimeoutError',
        ].includes(String(error.name)) || error.reason === 'read-failed',
    )
  )
    return 'rpc-unavailable'
  if (
    chain.some(
      (error) =>
        error.name === 'MigrationContractInvariantError' ||
        error.name === 'AccountVerificationError',
    )
  )
    return 'contract-incompatible'
  if (stage === 'account') return 'account-unavailable'
  return 'unknown'
}

export const migrationPreparationFailure = (
  error: unknown,
  fallbackStage: MigrationPreparationStage = 'preflight',
): MigrationPreparationFailure => {
  const stage =
    error instanceof MigrationPreparationError ? error.stage : fallbackStage
  const cause = error instanceof MigrationPreparationError ? error.cause : error
  return { stage, reason: reasonFor(stage, cause), cause }
}

export const runMigrationPreparationStage = async <T>(
  stage: MigrationPreparationStage,
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation()
  } catch (cause) {
    throw new MigrationPreparationError({ stage, cause })
  }
}

const messages: Record<MigrationPreparationReason, MessageDescriptor> = {
  'account-unavailable': msg`Couldn't prepare your account. Reconnect your wallet and try again.`,
  'account-mismatch': msg`Your upgrade account doesn't match this wallet. Reconnect the owner wallet.`,
  'contract-unavailable': msg`A required upgrade contract is unavailable. Please try again later.`,
  'contract-incompatible': msg`The upgrade contracts don't match this account. Please contact support.`,
  'resolver-not-writable': msg`Your wallet and your smart account both lost permission to update your names' records. Restore the permission in your profile, then try again.`,
  'locked-resolver-record-control': msg`A locked name's resolver cannot be safely replaced. Upgrading could make its records permanently uneditable. Deselect the name to continue.`,
  'legacy-resolver-content': msg`A name has a legacy content record that this upgrade cannot preserve. Update it to a contenthash record before upgrading, or deselect the name.`,
  'unsupported-resolver-records': msg`A name has primary-name records or DNS history that this upgrade cannot preserve. Deselect the name to keep its records.`,
  'records-unavailable': msg`Couldn't verify your name records. Please try again.`,
  'records-not-replayable': msg`Some locked names have records that this upgrade cannot preserve. Deselect those names to continue.`,
  'recovery-changed': msg`Couldn't restore your upgrade progress. Reload to check the latest state.`,
  'parent-not-upgraded': msg`Some subnames can't upgrade until their parent name is upgraded. Upgrade the parent first, or deselect those subnames.`,
  'reservation-not-synced': msg`A renewed name's ENSv2 reservation is out of date. Wait for it to sync before upgrading. If this continues, contact support.`,
  'rpc-unavailable': msg`Couldn't reach the network to prepare your upgrade. Please try again.`,
  'fee-unavailable': msg`Couldn't estimate the network fee`,
  unknown: msg`Couldn't prepare your upgrade. Please try again.`,
}

export const migrationPreparationMessage = (
  failure: Pick<MigrationPreparationFailure, 'reason'> &
    Partial<Pick<MigrationPreparationFailure, 'cause'>>,
): MessageDescriptor => {
  if (failure.cause instanceof SubnameRecreationError) {
    const details = failure.cause.message
    return msg`${details}`
  }
  if (failure.reason === 'locked-resolver-record-control') {
    const error = causeChain(failure.cause).find(
      (cause) =>
        cause.name === 'MigrationContractInvariantError' &&
        cause.invariant === 'locked-resolver-record-control',
    )
    if (typeof error?.ensName === 'string') {
      const ensName = error.ensName
      return msg`Upgrading ${ensName} could make its records permanently uneditable because its resolver cannot be replaced. Deselect this name to continue.`
    }
  }
  if (failure.reason === 'legacy-resolver-content') {
    const error = causeChain(failure.cause).find(
      (cause) => cause.name === 'LegacyResolverContentError',
    )
    if (typeof error?.ensName === 'string') {
      const ensName = error.ensName
      return msg`${ensName} has a legacy content record that this upgrade cannot preserve. Update it to a contenthash record before upgrading, or deselect this name.`
    }
  }
  if (failure.reason === 'unsupported-resolver-records') {
    const error = causeChain(failure.cause).find(
      (cause) => cause.name === 'UnsupportedResolverRecordsError',
    )
    if (typeof error?.ensName === 'string') {
      const ensName = error.ensName
      return msg`${ensName} has primary-name records or DNS history that this upgrade cannot preserve. Deselect this name to keep its records.`
    }
  }
  return messages[failure.reason]
}
