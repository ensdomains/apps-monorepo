import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { skipToken } from '@tanstack/react-query'
import { ok, ResultAsync } from 'neverthrow'
import type { Address, PublicClient } from 'viem'
import type { Config as WagmiConfig } from 'wagmi'
import {
  migrationHcaApprovalQueryKey,
  migrationOperatorApprovalsQueryKey,
} from '@/features/migration/service/migrationApprovalQueryKeys'
import {
  hasTemporaryMigrationHcaApproval,
  readActiveMigrationOperatorApprovals,
} from '@/features/migration/service/migrationApprovals'

export class GetMigrationOperatorApprovalsError extends TaggedError(
  'GetMigrationOperatorApprovalsError',
)<{
  cause: unknown
}> {}

export class GetMigrationHcaApprovalError extends TaggedError(
  'GetMigrationHcaApprovalError',
)<{
  cause: unknown
}> {}

export const getMigrationOperatorApprovals = ResultFn(async function* (params: {
  readonly owner: Address
  readonly hca: Address
  readonly wagmiConfig: WagmiConfig
}) {
  const approvals = yield* ResultAsync.fromPromise(
    readActiveMigrationOperatorApprovals({
      eoa: params.owner,
      hcaAddress: params.hca,
      wagmiConfig: params.wagmiConfig,
    }),
    (cause) => new GetMigrationOperatorApprovalsError({ cause }),
  )

  return ok(approvals)
})

export const getMigrationHcaApproval = ResultFn(async function* (params: {
  readonly owner: Address
  readonly hca: Address
  readonly publicClient: PublicClient
}) {
  const approved = yield* ResultAsync.fromPromise(
    hasTemporaryMigrationHcaApproval({
      publicClient: params.publicClient,
      eoa: params.owner,
      hcaAddress: params.hca,
    }),
    (cause) => new GetMigrationHcaApprovalError({ cause }),
  )

  return ok(approved)
})

export const getMigrationOperatorApprovalsQueryOptions = (params: {
  readonly owner?: Address
  readonly hca?: Address
  readonly chainId?: number
  readonly wagmiConfig: WagmiConfig
}) => {
  const { owner, hca, chainId, wagmiConfig } = params
  return resultQueryOptions({
    queryKey: migrationOperatorApprovalsQueryKey({ owner, hca, chainId }),
    queryFn:
      owner && hca
        ? () => getMigrationOperatorApprovals({ owner, hca, wagmiConfig })
        : skipToken,
    staleTime: 0,
  })
}

export const getMigrationHcaApprovalQueryOptions = (params: {
  readonly owner?: Address
  readonly hca?: Address
  readonly publicClient?: PublicClient
}) => {
  const { owner, hca, publicClient } = params
  return resultQueryOptions({
    queryKey: migrationHcaApprovalQueryKey({
      owner,
      hca,
      chainId: publicClient?.chain?.id,
    }),
    queryFn:
      owner && hca && publicClient
        ? () => getMigrationHcaApproval({ owner, hca, publicClient })
        : skipToken,
    staleTime: 0,
  })
}
