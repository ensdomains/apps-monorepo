import { orSafeExecution } from '@ens-apps/transaction-manager'
import { ResultFn } from '@ens-apps/utils/neverthrow'
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
import { withRequestDeadline } from '@/features/migration/service/requestDeadline'
import { ensureWalletChain } from '@/lib/wallet/ensureWalletChain'
import {
  RevokeMigrationApprovalError,
  toRevokeMigrationApprovalError,
  verifyMigrationApprovalRevocationReceipt,
} from './revokeMigrationApproval.helpers'

const RECEIPT_TIMEOUT_MS = 180_000

export const revokeMigrationApproval = ResultFn(async function* (params: {
  readonly approval: MigrationOperatorApproval
  readonly owner?: Address
  readonly hca?: Address
  readonly walletAddress?: Address
  readonly chainId?: number
  readonly wagmiConfig: WagmiConfig
  readonly queryClient: QueryClient
}) {
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
    return err(
      new RevokeMigrationApprovalError({
        cause: undefined,
        message: 'Connect the owner wallet to remove this permission.',
      }),
    )
  }
  const publicClient = getPublicClient(wagmiConfig, { chainId })
  if (!publicClient)
    return err(
      new RevokeMigrationApprovalError({
        cause: undefined,
        message: 'Switch to the migration network and try again.',
      }),
    )

  yield* fromPromise(
    ensureWalletChain(wagmiConfig, chainId),
    toRevokeMigrationApprovalError,
  )
  const hash = yield* fromPromise(
    writeContract(wagmiConfig, {
      address: approval.contractAddress,
      abi: OPERATOR_APPROVAL_ABI,
      functionName: 'setApprovalForAll',
      args: [approval.operatorAddress, false],
      account: owner,
      chainId,
    }),
    toRevokeMigrationApprovalError,
  )
  const receiptOf = (txHash: Hash) =>
    fromPromise(
      waitForTransactionReceipt(wagmiConfig, {
        hash: txHash,
        chainId,
        timeout: RECEIPT_TIMEOUT_MS,
      }),
      (cause) => cause,
    )
  const receipt = yield* fromPromise(
    withRequestDeadline(
      async (signal) =>
        orSafeExecution({
          publicClient,
          connector: getConnection(wagmiConfig).connector,
          account: owner,
          id: hash,
          timeout: RECEIPT_TIMEOUT_MS,
          direct: receiptOf(hash),
          settle: receiptOf,
          signal,
        }),
      { timeoutMs: RECEIPT_TIMEOUT_MS },
    ),
    (cause) => cause,
  )
    .andThen((result) => result)
    .mapErr(toRevokeMigrationApprovalError)
  yield* verifyMigrationApprovalRevocationReceipt(receipt)

  yield* fromPromise(
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: migrationOperatorApprovalsQueryKey({ owner, hca, chainId }),
      }),
      queryClient.invalidateQueries({
        queryKey: migrationHcaApprovalQueryKey({ owner, hca, chainId }),
      }),
    ]),
    toRevokeMigrationApprovalError,
  )
  return ok(undefined)
})
