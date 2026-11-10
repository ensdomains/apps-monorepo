import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useResolverCopySource } from './useResolverCopySource'

const OWNER_WALLET = '0x0000000000000000000000000000000000000001'

const mocks = vi.hoisted(() => ({
  readCopySource: vi.fn<() => Promise<{ chainId: number } | null>>(),
}))

vi.mock('wagmi', () => ({ useChainId: () => 1 }))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({
    isConnected: true,
    ownerAddress: OWNER_WALLET,
  }),
}))
vi.mock('../service/resolverImport', () => ({
  resolverCopySourceQuery: (name: string, wallet: string) => ({
    queryKey: ['resolver-copy-source', name, wallet],
    queryFn: mocks.readCopySource,
  }),
}))

const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
)

const renderCopySource = (isInGrace = false) =>
  renderHook(
    () =>
      useResolverCopySource({
        name: 'fox-1.eth',
        isInGrace,
        isExpiryError: false,
        isUpgradeRequired: false,
      }),
    { wrapper },
  )

describe('useResolverCopySource', () => {
  beforeEach(() => {
    mocks.readCopySource.mockReset()
  })

  it('reports the read as pending until it answers', async () => {
    mocks.readCopySource.mockResolvedValue(null)
    const { result } = renderCopySource()

    expect(result.current.isPending).toBe(true)
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.resolverCopySource).toBeUndefined()
  })

  it('is not pending when the read is disabled', () => {
    const { result } = renderCopySource(true)

    expect(result.current.isPending).toBe(false)
    expect(mocks.readCopySource).not.toHaveBeenCalled()
  })
})
