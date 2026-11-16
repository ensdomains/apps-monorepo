import { orSafeExecution } from '@ens-apps/transaction-manager'
import { TransactionRevertedError } from '@ens-apps/transaction-manager/errors/transaction.errors'
import type { QueryClient } from '@tanstack/react-query'
import {
  getConnection,
  getPublicClient,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core'
import { err, fromPromise, ok } from 'neverthrow'
import { type Address, type Hash, isAddressEqual } from 'viem'
import type { Config as WagmiConfig } from 'wagmi'
import { OPERATOR_APPROVAL_ABI } from '@/features/migration/contracts/abis'
import {
  migrationHcaApprovalQueryKey,
  migrationOperatorApprovalsQueryKey,
} from '@/features/migration/service/migrationApprovalQueryKeys'
import type { MigrationOperatorApproval } from '@/features/migration/service/migrationApprovals'
import { ensureWalletChain } from '@/lib/wallet/ensureWalletChain'

/** viem's default, which the direct receipt wait keeps. */
const RECEIPT_TIMEOUT_MS = 180_000

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
  const publicClient = getPublicClient(wagmiConfig, { chainId })
  if (!publicClient) {
    throw new Error('Switch to the migration network and try again.')
  }

  await ensureWalletChain(wagmiConfig, chainId)
  const hash = await writeContract(wagmiConfig, {
    address: approval.contractAddress,
    abi: OPERATOR_APPROVAL_ABI,
    functionName: 'setApprovalForAll',
    args: [approval.operatorAddress, false],
    account: owner,
    chainId,
  })
  const receiptOf = (txHash: Hash) =>
    fromPromise(
      waitForTransactionReceipt(wagmiConfig, { hash: txHash, chainId }),
      (cause) => cause,
    )
  // A Safe{Wallet} answers with its safeTxHash; a failed Safe execution counts as a revert.
  const status = await orSafeExecution({
    publicClient,
    connector: getConnection(wagmiConfig).connector,
    account: owner,
    id: hash,
    timeout: RECEIPT_TIMEOUT_MS,
    direct: receiptOf(hash),
    settle: receiptOf,
    signal: AbortSignal.timeout(RECEIPT_TIMEOUT_MS),
  })
    .map(({ status }) => status)
    .orElse((error) =>
      error instanceof TransactionRevertedError
        ? ok('reverted' as const)
        : err(error),
    )
  if (status.isErr()) throw status.error
  if (status.value !== 'success') {
    throw new Error('The revocation failed. Please try again.')
  }

  // Trust the receipt: a latest-block read from a lagging node still lists the approval.
  const approvalsKey = migrationOperatorApprovalsQueryKey({
    owner,
    hca,
    chainId,
  })
  await queryClient.cancelQueries({ queryKey: approvalsKey, exact: true })
  queryClient.setQueryData<readonly MigrationOperatorApproval[]>(
    approvalsKey,
    (approvals) => approvals?.filter(({ id }) => id !== approval.id),
  )
  await queryClient.invalidateQueries({
    queryKey: migrationHcaApprovalQueryKey({ owner, hca, chainId }),
  })
}
