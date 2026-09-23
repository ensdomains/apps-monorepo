import { queryOptions, skipToken } from '@tanstack/react-query'
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

export const migrationOperatorApprovalsQueryOptions = (params: {
  readonly owner?: Address
  readonly hca?: Address
  readonly chainId?: number
  readonly wagmiConfig: WagmiConfig
}) => {
  const { owner, hca, chainId, wagmiConfig } = params
  return queryOptions({
    queryKey: migrationOperatorApprovalsQueryKey({ owner, hca, chainId }),
    queryFn:
      owner && hca
        ? () =>
            readActiveMigrationOperatorApprovals({
              eoa: owner,
              hcaAddress: hca,
              wagmiConfig,
            })
        : skipToken,
    staleTime: 0,
  })
}

export const migrationHcaApprovalQueryOptions = (params: {
  readonly owner?: Address
  readonly hca?: Address
  readonly publicClient?: PublicClient
}) => {
  const { owner, hca, publicClient } = params
  return queryOptions({
    queryKey: migrationHcaApprovalQueryKey({
      owner,
      hca,
      chainId: publicClient?.chain?.id,
    }),
    queryFn:
      owner && hca && publicClient
        ? () =>
            hasTemporaryMigrationHcaApproval({
              publicClient,
              eoa: owner,
              hcaAddress: hca,
            })
        : skipToken,
    staleTime: 0,
  })
}
