import type { QueryClient } from '@tanstack/react-query'
import { waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { type Address, isAddressEqual } from 'viem'
import type { Config as WagmiConfig } from 'wagmi'
import { OPERATOR_APPROVAL_ABI } from '@/features/migration/contracts/abis'
import {
  migrationHcaApprovalQueryKey,
  migrationOperatorApprovalsQueryKey,
} from '@/features/migration/service/migrationApprovalQueryKeys'
import type { MigrationOperatorApproval } from '@/features/migration/service/migrationApprovals'

export const revokeMigrationApproval = async (params: {
  readonly approval: MigrationOperatorApproval
  readonly owner?: Address
  readonly hca?: Address
  readonly walletAddress?: Address
  readonly chainId?: number
  readonly wagmiConfig: WagmiConfig
  readonly queryClient: QueryClient
}): Promise<void> => {
  const {
    approval,
    owner,
    hca,
    walletAddress,
    chainId,
    wagmiConfig,
    queryClient,
  } = params
  if (
    !owner ||
    !walletAddress ||
    !chainId ||
    !isAddressEqual(owner, walletAddress)
  ) {
    throw new Error('Connect the owner wallet to remove this permission.')
  }

  const hash = await writeContract(wagmiConfig, {
    address: approval.contractAddress,
    abi: OPERATOR_APPROVAL_ABI,
    functionName: 'setApprovalForAll',
    args: [approval.operatorAddress, false],
    account: owner,
    chainId,
  })
  const receipt = await waitForTransactionReceipt(wagmiConfig, {
    hash,
    chainId,
  })
  if (receipt.status !== 'success') {
    throw new Error('The revocation failed. Please try again.')
  }

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: migrationOperatorApprovalsQueryKey({ owner, hca, chainId }),
    }),
    queryClient.invalidateQueries({
      queryKey: migrationHcaApprovalQueryKey({ owner, hca, chainId }),
    }),
  ])
}
