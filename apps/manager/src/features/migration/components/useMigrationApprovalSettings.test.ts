import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createConfig, getPublicClient, http } from '@wagmi/core'
import { createElement, type ReactNode } from 'react'
import { createPublicClient, createWalletClient } from 'viem'
import { mainnet } from 'viem/chains'
import { afterEach, expect, it, vi } from 'vitest'
import { useConfig, usePublicClient } from 'wagmi'
import type { MigrationOperatorApproval } from '@/features/migration/service/migrationApprovals'
import { useSmartAccountContext } from '@/lib/smart-account'
import { ensureWalletChain } from '@/lib/wallet/ensureWalletChain'
import { useMigrationApprovalSettings } from './useMigrationApprovalSettings'

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConfig: vi.fn(),
  usePublicClient: vi.fn(),
}))
vi.mock('@/lib/smart-account', () => ({ useSmartAccountContext: vi.fn() }))
vi.mock('@wagmi/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@wagmi/core')>()),
  getPublicClient: vi.fn(),
}))
vi.mock('@/lib/wallet/ensureWalletChain', () => ({
  ensureWalletChain: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

it('surfaces an actual revocation error through the mutation boundary', async () => {
  const owner = '0x1111111111111111111111111111111111111111'
  const wagmiConfig = createConfig({
    chains: [mainnet],
    transports: { [mainnet.id]: http() },
  })
  const publicClient = createPublicClient({ chain: mainnet, transport: http() })
  const walletClient = createWalletClient({
    account: owner,
    chain: mainnet,
    transport: http(),
  })
  vi.mocked(useConfig).mockReturnValue(wagmiConfig)
  vi.mocked(usePublicClient).mockReturnValue(publicClient)
  vi.mocked(getPublicClient).mockReturnValue(publicClient)
  vi.mocked(useSmartAccountContext, { partial: true }).mockReturnValue({
    ownerAddress: owner,
    walletClient,
  })
  const cause = new Error('Wallet is locked')
  vi.mocked(ensureWalletChain).mockRejectedValue(cause)
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const approval: MigrationOperatorApproval = {
    kind: 'operator',
    id: 'eth-registry:hca',
    contractAddress: '0x2222222222222222222222222222222222222222',
    operatorAddress: '0x3333333333333333333333333333333333333333',
  }
  const { result } = renderHook(useMigrationApprovalSettings, {
    wrapper: ({ children }: { readonly children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  })
  act(() => result.current.revoke.mutate(approval))
  await waitFor(() => expect(result.current.revoke.isError).toBe(true))
  expect(result.current.revoke.error?.message).toBe('Wallet is locked')
  expect(result.current.revoke.error?.cause).toBe(cause)
  queryClient.clear()
})
