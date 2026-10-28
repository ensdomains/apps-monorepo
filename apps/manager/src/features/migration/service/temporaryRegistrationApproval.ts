import { match } from 'ts-pattern'
import type { Address, Hex } from 'viem'
import {
  type MigrationApprovalReview,
  type MigrationRegistrationApprovalStrategy,
  migrationApprovalReviewKey,
} from './migrationApprovals'
import type { TemporaryRegistrationApproval } from './migrationBatchJournal'

export const isTemporaryRegistrationRecoveryScopeValid = (params: {
  readonly strategy: MigrationRegistrationApprovalStrategy | undefined
  readonly required: MigrationApprovalReview | null
  readonly reviewed: MigrationApprovalReview | undefined
}): boolean =>
  params.strategy === 'temporary-operator' &&
  params.required !== null &&
  params.reviewed !== undefined &&
  migrationApprovalReviewKey(params.required) ===
    migrationApprovalReviewKey(params.reviewed)

export const isDefinitelyUnsubmittedMigrationApprovalError = (
  error: unknown,
): boolean => {
  let current = error
  for (
    let depth = 0;
    depth < 10 && typeof current === 'object' && current !== null;
    depth += 1
  ) {
    if (
      ('_tag' in current &&
        (current._tag === 'ChainIdMismatchError' ||
          current._tag === 'SignerAddressMismatchError')) ||
      ('name' in current && current.name === 'ChainMismatchError')
    )
      return true
    current = 'cause' in current ? current.cause : undefined
  }
  return false
}

export const registrationApprovalRecoveryDecision = (params: {
  readonly status: TemporaryRegistrationApproval['state']['status']
  readonly isActive: boolean
  readonly receiptStatus?: 'success' | 'reverted'
}): 'granted' | 'complete' | 'unresolved' =>
  match(params.status)
    .with('granted', () =>
      params.isActive ? ('granted' as const) : ('complete' as const),
    )
    .with('grant-pending', () => {
      if (params.receiptStatus === undefined) return 'unresolved' as const
      return params.receiptStatus === 'success' && params.isActive
        ? ('granted' as const)
        : ('complete' as const)
    })
    .with('revoke-pending', () => {
      if (!params.isActive) return 'complete' as const
      return params.receiptStatus === 'reverted'
        ? ('granted' as const)
        : ('unresolved' as const)
    })
    .exhaustive()

export const isExpectedMigrationApprovalRequest = (params: {
  readonly request: unknown
  readonly owner: Address
  readonly chainId: number
  readonly contractAddress: Address
  readonly data: Hex
}): boolean => {
  const { request } = params
  if (typeof request !== 'object' || request === null) return false
  const fields = request as Record<string, unknown>
  return (
    typeof fields.from === 'string' &&
    fields.from.toLowerCase() === params.owner.toLowerCase() &&
    typeof fields.to === 'string' &&
    fields.to.toLowerCase() === params.contractAddress.toLowerCase() &&
    fields.chainId === params.chainId &&
    typeof fields.data === 'string' &&
    fields.data.toLowerCase() === params.data.toLowerCase() &&
    fields.value === 0n
  )
}
