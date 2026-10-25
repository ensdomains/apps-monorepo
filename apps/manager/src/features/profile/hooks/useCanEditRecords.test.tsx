import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanEditRecords } from './useCanEditRecords'

const OWNER_WALLET = '0x0000000000000000000000000000000000000001'

const mocks = vi.hoisted(() => ({
  canWrite: vi.fn<() => Promise<boolean>>(),
}))

vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({ ownerAddress: OWNER_WALLET }),
}))
vi.mock('@/features/profile/service/resolverWriteAccess', () => ({
  resolverWriteAccessQuery: (name: string, ownerAddress: string) => ({
    queryKey: ['resolver-write-access', name, ownerAddress],
    queryFn: mocks.canWrite,
  }),
}))

const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
)

const renderCanEdit = (isOwner: boolean | undefined, enabled = true) =>
  renderHook(() => useCanEditRecords({ enabled, isOwner, name: 'fox-1.eth' }), {
    wrapper,
  })

describe('useCanEditRecords', () => {
  beforeEach(() => {
    mocks.canWrite.mockReset()
  })

  it('lets the owner edit after probing the resolver', async () => {
    mocks.canWrite.mockResolvedValue(true)
    const { result } = renderCanEdit(true)

    await waitFor(() => expect(result.current).toBe(true))
    expect(mocks.canWrite).toHaveBeenCalled()
  })

  it('lets a previous owner edit while their wallet can still write the resolver', async () => {
    mocks.canWrite.mockResolvedValue(true)
    const { result } = renderCanEdit(false)

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('hides editing once the resolver rejects the wallet', async () => {
    mocks.canWrite.mockResolvedValue(false)
    const { result } = renderCanEdit(false)

    await waitFor(() => expect(mocks.canWrite).toHaveBeenCalled())
    expect(result.current).toBe(false)
  })

  it('hides editing when the probe fails', async () => {
    mocks.canWrite.mockRejectedValue(new Error('rpc down'))
    const { result } = renderCanEdit(false)

    await waitFor(() => expect(mocks.canWrite).toHaveBeenCalled())
    expect(result.current).toBe(false)
  })

  it.each([
    ['ownership is still loading', undefined, true],
    ['the probe is disabled', false, false],
  ])('does not probe while %s', (_, isOwner, enabled) => {
    const { result } = renderCanEdit(isOwner, enabled)

    expect(result.current).toBeFalsy()
    expect(mocks.canWrite).not.toHaveBeenCalled()
  })
})
