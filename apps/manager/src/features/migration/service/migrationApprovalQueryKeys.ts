import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Address } from 'viem'

type MigrationApprovalQueryScope = {
  readonly owner?: Address
  readonly hca?: Address
  readonly chainId?: number
}

const operatorApprovalsKey = createQueryKey<
  'migration-operator-approvals',
  { owner?: string; hca?: string; chainId?: number }
>('migration-operator-approvals')

const hcaApprovalKey = createQueryKey<
  'migration-hca-approval',
  { owner?: string; hca?: string; chainId?: number }
>('migration-hca-approval')

const normalizedScope = ({
  owner,
  hca,
  chainId,
}: MigrationApprovalQueryScope) => ({
  ...(owner ? { owner: owner.toLowerCase() } : {}),
  ...(hca ? { hca: hca.toLowerCase() } : {}),
  ...(chainId === undefined ? {} : { chainId }),
})

export const migrationOperatorApprovalsQueryKey = (
  scope: MigrationApprovalQueryScope,
) => operatorApprovalsKey(normalizedScope(scope))

export const migrationHcaApprovalQueryKey = (
  scope: MigrationApprovalQueryScope,
) => hcaApprovalKey(normalizedScope(scope))
