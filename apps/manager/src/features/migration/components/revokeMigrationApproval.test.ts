import { QueryClient } from '@tanstack/react-query'
import { waitForTransactionReceipt, writeContract } from '@wagmi/core'
import type { Address, Hex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config as WagmiConfig } from 'wagmi'
import {
  migrationHcaApprovalQueryKey,
  migrationOperatorApprovalsQueryKey,
} from '@/features/migration/service/migrationApprovalQueryKeys'
import type { MigrationOperatorApproval } from '@/features/migration/service/migrationApprovals'
import { revokeMigrationApproval } from './revokeMigrationApproval'

vi.mock('@wagmi/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wagmi/core')>()),
  waitForTransactionReceipt: vi.fn(),
  writeContract: vi.fn(),
}))

const writeContractMock = vi.mocked(writeContract)
const waitForTransactionReceiptMock = vi.mocked(waitForTransactionReceipt)
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

beforeEach(() => {
  vi.resetAllMocks()
  writeContractMock.mockResolvedValue(hash)
  waitForTransactionReceiptMock.mockResolvedValue(receipt('success'))
})

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

  it('waits for success before refreshing both approval queries in the matching scope', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await revokeMigrationApproval({
      approval,
      owner,
      hca,
      walletAddress: owner.toLowerCase() as Address,
      chainId,
      wagmiConfig,
      queryClient,
    })

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
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: migrationOperatorApprovalsQueryKey({ owner, hca, chainId }),
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: migrationHcaApprovalQueryKey({
        owner: owner.toLowerCase() as Address,
        hca,
        chainId,
      }),
    })
  })

  it('refuses a different wallet before submitting', async () => {
    const queryClient = new QueryClient()

    await expect(
      revokeMigrationApproval({
        approval,
        owner,
        hca,
        walletAddress: otherWallet,
        chainId,
        wagmiConfig,
        queryClient,
      }),
    ).rejects.toThrow('Connect the owner wallet')
    expect(writeContractMock).not.toHaveBeenCalled()
  })

  it('does not refresh approvals when the receipt reports a revert', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    waitForTransactionReceiptMock.mockResolvedValue(receipt('reverted'))

    await expect(
      revokeMigrationApproval({
        approval,
        owner,
        hca,
        walletAddress: owner,
        chainId,
        wagmiConfig,
        queryClient,
      }),
    ).rejects.toThrow('The revocation failed')
    expect(invalidate).not.toHaveBeenCalled()
  })
})
