import { QueryClient, QueryObserver } from '@tanstack/react-query'
import {
  getConnection,
  getPublicClient,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core'
import {
  type Address,
  type Hex,
  WaitForTransactionReceiptTimeoutError,
} from 'viem'
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config as WagmiConfig } from 'wagmi'
import {
  migrationHcaApprovalQueryKey,
  migrationOperatorApprovalsQueryKey,
} from '@/features/migration/service/migrationApprovalQueryKeys'
import type { MigrationOperatorApproval } from '@/features/migration/service/migrationApprovals'
import { ensureWalletChain } from '@/lib/wallet/ensureWalletChain'
import {
  createSafeExecutionPublicClient,
  SAFE_WALLET_CONNECTOR,
} from '@/test-utils/safeWallet.fixture'
import { revokeMigrationApproval } from './revokeMigrationApproval'

vi.mock('@wagmi/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wagmi/core')>()),
  getConnection: vi.fn(),
  getPublicClient: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  writeContract: vi.fn(),
}))
vi.mock('@/lib/wallet/ensureWalletChain', () => ({
  ensureWalletChain: vi.fn(),
}))

const ensureWalletChainMock = vi.mocked(ensureWalletChain)
const writeContractMock = vi.mocked(writeContract)
const waitForTransactionReceiptMock = vi.mocked(waitForTransactionReceipt)
const getConnectionMock = vi.mocked(getConnection, { partial: true })
const getPublicClientMock = vi.mocked(getPublicClient)
const owner: Address = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'
const hca: Address = '0x0000000000000000000000000000000000000003'
const otherWallet: Address = '0x0000000000000000000000000000000000000004'
const chainId = 1
const hash: Hex = `0x${'a'.repeat(64)}`
const wagmiConfig = {} as WagmiConfig
const approval: MigrationOperatorApproval = {
  kind: 'operator',
  id: 'eth-registry:hca',
  contractAddress: '0x0000000000000000000000000000000000000005',
  operatorAddress: hca,
}

const receipt = (status: 'success' | 'reverted') =>
  ({ status }) as Awaited<ReturnType<typeof waitForTransactionReceipt>>
const executionHash: Hex = `0x${'c'.repeat(64)}`

const connectSafe = (event: 'ExecutionSuccess' | 'ExecutionFailure') => {
  getConnectionMock.mockReturnValue({
    connector: SAFE_WALLET_CONNECTOR,
  })
  getPublicClientMock.mockReturnValue(
    createSafeExecutionPublicClient({
      ownerAddress: owner,
      safeTxHash: hash,
      executionHash,
      event,
    }),
  )
  waitForTransactionReceiptMock.mockImplementation(
    async (_config, { hash: waited }) => {
      if (waited !== executionHash)
        throw new WaitForTransactionReceiptTimeoutError({ hash: waited })
      return receipt('success')
    },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  ensureWalletChainMock.mockResolvedValue(undefined)
  writeContractMock.mockResolvedValue(hash)
  waitForTransactionReceiptMock.mockResolvedValue(receipt('success'))
  getConnectionMock.mockReturnValue({ connector: undefined })
  getPublicClientMock.mockReturnValue(
    createSafeExecutionPublicClient({
      ownerAddress: owner,
      safeTxHash: hash,
      executionHash,
      event: 'ExecutionSuccess',
    }),
  )
})

afterEach(() => vi.useRealTimers())

describe('revokeMigrationApproval', () => {
  it('supports partial invalidation by owner across HCA and chain scopes', async () => {
    const queryClient = new QueryClient()
    const firstKey = migrationHcaApprovalQueryKey({ owner, hca, chainId })
    const secondKey = migrationHcaApprovalQueryKey({
      owner: owner.toLowerCase() as Address,
      hca: otherWallet,
      chainId: 8453,
    })
    queryClient.setQueryData(firstKey, true)
    queryClient.setQueryData(secondKey, false)

    await queryClient.invalidateQueries({
      queryKey: migrationHcaApprovalQueryKey({ owner }),
    })

    expect(queryClient.getQueryState(firstKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(secondKey)?.isInvalidated).toBe(true)
  })

  it('waits for success before refreshing the HCA approval query in the matching scope', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const result = await revokeMigrationApproval({
      approval,
      owner,
      hca,
      walletAddress: owner.toLowerCase() as Address,
      chainId,
      wagmiConfig,
      queryClient,
    })
    assert(result.isOk())

    expect(ensureWalletChainMock).toHaveBeenCalledWith(wagmiConfig, chainId)
    expect(ensureWalletChainMock).toHaveBeenCalledBefore(writeContractMock)
    expect(writeContractMock).toHaveBeenCalledWith(wagmiConfig, {
      address: approval.contractAddress,
      abi: expect.any(Array),
      functionName: 'setApprovalForAll',
      args: [hca, false],
      account: owner,
      chainId,
    })
    expect(waitForTransactionReceiptMock).toHaveBeenCalledWith(wagmiConfig, {
      hash,
      chainId,
      timeout: 180_000,
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: migrationHcaApprovalQueryKey({
        owner: owner.toLowerCase() as Address,
        hca,
        chainId,
      }),
    })
  })

  it('keeps a confirmed revocation off the list while a lagging node still reports it', async () => {
    const queryClient = new QueryClient()
    const queryKey = migrationOperatorApprovalsQueryKey({ owner, hca, chainId })
    queryClient.setQueryData(queryKey, [approval])
    // A node behind the revocation's block, read both before and after it lands.
    const laggingRead = new Promise<readonly MigrationOperatorApproval[]>(
      (resolve) => setTimeout(() => resolve([approval]), 20),
    )
    const unsubscribe = new QueryObserver(queryClient, {
      queryKey,
      queryFn: () => laggingRead,
    }).subscribe(() => {})

    await revokeMigrationApproval({
      approval,
      owner,
      hca,
      walletAddress: owner,
      chainId,
      wagmiConfig,
      queryClient,
    })
    await vi.waitFor(() => expect(queryClient.isFetching({ queryKey })).toBe(0))
    unsubscribe()

    expect(queryClient.getQueryData(queryKey)).toEqual([])
  })

  it('settles a Safe{Wallet} revocation from its execution', async () => {
    connectSafe('ExecutionSuccess')
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const result = await revokeMigrationApproval({
      approval,
      owner,
      hca,
      walletAddress: owner,
      chainId,
      wagmiConfig,
      queryClient,
    })
    assert(result.isOk())

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: migrationHcaApprovalQueryKey({ owner, hca, chainId }),
    })
  })

  it('finishes a stalled Safe revocation without refreshing approvals', async () => {
    vi.useFakeTimers()
    const publicClient = createSafeExecutionPublicClient({
      ownerAddress: owner,
      safeTxHash: hash,
      executionHash,
      event: 'ExecutionSuccess',
      hasExecution: false,
    })
    vi.spyOn(publicClient, 'getLogs').mockReturnValue(
      new Promise<never>(() => undefined),
    )
    getPublicClientMock.mockReturnValue(publicClient)
    getConnectionMock.mockReturnValue({ connector: SAFE_WALLET_CONNECTOR })
    waitForTransactionReceiptMock.mockReturnValue(
      new Promise<never>(() => undefined),
    )
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const settled =
      vi.fn<
        (result: Awaited<ReturnType<typeof revokeMigrationApproval>>) => void
      >()

    void revokeMigrationApproval({
      approval,
      owner,
      hca,
      walletAddress: owner,
      chainId,
      wagmiConfig,
      queryClient,
    }).then(settled)
    await vi.runAllTimersAsync()

    expect(settled).toHaveBeenCalledOnce()
    const result = settled.mock.calls[0]?.[0]
    assert(result?.isErr())
    expect(result.error.cause).toMatchObject({ name: 'TimeoutError' })
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('reports a failed Safe{Wallet} execution as a failed revocation', async () => {
    connectSafe('ExecutionFailure')
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const result = await revokeMigrationApproval({
      approval,
      owner,
      hca,
      walletAddress: owner,
      chainId,
      wagmiConfig,
      queryClient,
    })
    assert(result.isErr())
    expect(result.error.message).toContain('The revocation failed')
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('refuses a different wallet before submitting', async () => {
    const queryClient = new QueryClient()

    const result = await revokeMigrationApproval({
      approval,
      owner,
      hca,
      walletAddress: otherWallet,
      chainId,
      wagmiConfig,
      queryClient,
    })
    assert(result.isErr())
    expect(result.error.message).toContain('Connect the owner wallet')
    expect(writeContractMock).not.toHaveBeenCalled()
  })

  it('does not refresh approvals when the receipt reports a revert', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    waitForTransactionReceiptMock.mockResolvedValue(receipt('reverted'))

    const result = await revokeMigrationApproval({
      approval,
      owner,
      hca,
      walletAddress: owner,
      chainId,
      wagmiConfig,
      queryClient,
    })
    assert(result.isErr())
    expect(result.error.message).toContain('The revocation failed')
    expect(invalidate).not.toHaveBeenCalled()
  })
})
