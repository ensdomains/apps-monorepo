import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { useConfig, usePublicClient, useWalletClient } from 'wagmi'
import { migrationOperatorApprovalsQueryOptions } from '@/features/migration/service/migrationApprovalQueries'
import type { MigrationOperatorApproval } from '@/features/migration/service/migrationApprovals'
import { useSmartAccountContext } from '@/lib/smart-account'
import { revokeMigrationApproval } from './revokeMigrationApproval'

const orderActiveApprovals = (
  approvals: readonly MigrationOperatorApproval[],
): readonly MigrationOperatorApproval[] => {
  const temporaryHcaApproval = approvals.find(
    (approval) => approval.id === 'eth-registry:hca',
  )
  return temporaryHcaApproval
    ? [
        temporaryHcaApproval,
        ...approvals.filter((approval) => approval !== temporaryHcaApproval),
      ]
    : approvals
}

export const useMigrationApprovalSettings = () => {
  const { ownerAddress, accountAddress: hcaAddress } = useSmartAccountContext()
  const { data: walletClient } = useWalletClient()
  const wagmiConfig = useConfig()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const owner = ownerAddress as Address | undefined
  const hca = hcaAddress as Address | undefined
  const chainId = publicClient?.chain.id
  const approvalsQuery = useQuery(
    migrationOperatorApprovalsQueryOptions({
      owner,
      hca,
      chainId,
      wagmiConfig,
    }),
  )
  const revoke = useMutation({
    mutationFn: (approval: MigrationOperatorApproval) =>
      revokeMigrationApproval({
        approval,
        owner,
        hca,
        walletAddress: walletClient?.account?.address,
        chainId,
        wagmiConfig,
        queryClient,
      }),
  })

  return {
    owner,
    hca,
    approvalsQuery,
    displayedApprovals: orderActiveApprovals(approvalsQuery.data ?? []),
    revoke,
  }
}
