import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const reactQueryMock = vi.hoisted(() => ({ useQuery: vi.fn() }))
const wagmiMock = vi.hoisted(() => ({ useConnection: vi.fn() }))
const smartAccountMock = vi.hoisted(() => ({
  useSmartAccountContextSafe: vi.fn(),
}))
const namesQueryMock = vi.hoisted(() => ({
  getDashboardNamesQuery: vi.fn(() => ({ queryKey: ['names'] })),
}))

vi.mock('@tanstack/react-query', () => reactQueryMock)
vi.mock('wagmi', () => wagmiMock)
vi.mock('@/lib/smart-account/SmartAccountContext', () => smartAccountMock)
vi.mock('./service/queries/getDashboardNames', () => namesQueryMock)

import { useDashboardNames } from './useDashboardNames'

describe('useDashboardNames', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wagmiMock.useConnection.mockReturnValue({
      address: '0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
    })
    smartAccountMock.useSmartAccountContextSafe.mockReturnValue({
      accountAddress: '0x0000000000000000000000000000000000000002',
      ownerAddress: '0xABCDEF0123456789ABCDEF0123456789ABCDEF01',
    })
    reactQueryMock.useQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    })
  })

  it('reads the unique connected addresses', () => {
    const { result } = renderHook(() => useDashboardNames())

    expect(namesQueryMock.getDashboardNamesQuery).toHaveBeenCalledWith([
      '0xabcdef0123456789abcdef0123456789abcdef01',
      '0x0000000000000000000000000000000000000002',
    ])
    expect(result.current).toMatchObject({
      names: [],
      isPending: true,
      isAllPagesLoaded: false,
    })
  })

  it('is settled and empty without a connected address', () => {
    wagmiMock.useConnection.mockReturnValue({ address: undefined })
    smartAccountMock.useSmartAccountContextSafe.mockReturnValue(null)

    const { result } = renderHook(() => useDashboardNames())

    expect(namesQueryMock.getDashboardNamesQuery).toHaveBeenCalledWith(
      undefined,
    )
    expect(result.current).toMatchObject({
      hasOwnerAddresses: false,
      isPending: false,
      isAllPagesLoaded: true,
    })
  })

  it('surfaces query failures', () => {
    reactQueryMock.useQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    })

    const { result } = renderHook(() => useDashboardNames())

    expect(result.current.isError).toBe(true)
  })
})
