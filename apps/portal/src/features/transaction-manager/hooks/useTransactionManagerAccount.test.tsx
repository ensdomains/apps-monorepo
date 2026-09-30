import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  setConnectedAccount: vi.fn(),
}))

vi.mock('wagmi', () => ({ useAccount: mocks.useAccount }))
vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { setConnectedAccount: mocks.setConnectedAccount },
}))

import { useTransactionManagerAccount } from './useTransactionManagerAccount'

const ADDRESS = '0x1111111111111111111111111111111111111111'

beforeEach(() => {
  mocks.setConnectedAccount.mockClear()
})

describe('useTransactionManagerAccount', () => {
  it('reports a settled connection', () => {
    mocks.useAccount.mockReturnValue({
      address: ADDRESS,
      status: 'connected',
    })

    renderHook(() => useTransactionManagerAccount())

    expect(mocks.setConnectedAccount).toHaveBeenCalledWith(ADDRESS)
  })

  it.each([
    'connecting',
    'reconnecting',
    'disconnected',
  ] as const)('says nothing while the wallet is %s', (status) => {
    // A lock, a reload or a pending reconnect all report no address. None of
    // them means another wallet has taken over, and acting on them would
    // throw away the actors an open modal is still rendering.
    mocks.useAccount.mockReturnValue({ address: undefined, status })

    renderHook(() => useTransactionManagerAccount())

    expect(mocks.setConnectedAccount).not.toHaveBeenCalled()
  })

  it('says nothing if a status of connected arrives without an address', () => {
    mocks.useAccount.mockReturnValue({
      address: undefined,
      status: 'connected',
    })

    renderHook(() => useTransactionManagerAccount())

    expect(mocks.setConnectedAccount).not.toHaveBeenCalled()
  })
})
