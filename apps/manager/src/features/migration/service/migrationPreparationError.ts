import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

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
  | 'records-unavailable'
  | 'records-not-replayable'
  | 'recovery-changed'
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
  if (stage === 'fee') return 'fee-unavailable'
  const chain = causeChain(cause)
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
  'records-unavailable': msg`Couldn't verify your name records. Please try again.`,
  'records-not-replayable': msg`Some locked names have records that this upgrade cannot preserve. Deselect those names to continue.`,
  'recovery-changed': msg`Couldn't restore your upgrade progress. Reload to check the latest state.`,
  'rpc-unavailable': msg`Couldn't reach the network to prepare your upgrade. Please try again.`,
  'fee-unavailable': msg`Couldn't estimate the network fee`,
  unknown: msg`Couldn't prepare your upgrade. Please try again.`,
}

export const migrationPreparationMessage = (
  failure: Pick<MigrationPreparationFailure, 'reason'>,
): MessageDescriptor => messages[failure.reason]
