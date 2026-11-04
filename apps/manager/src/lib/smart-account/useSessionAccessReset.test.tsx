import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionAccessReset } from './useSessionAccessReset'

const HCA: Address = '0xabcdef0123456789abcdef0123456789abcdef01'
const CHAIN_ID = 11155111

const renderTab = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderHook(
    () =>
      useSessionAccessReset({
        accountAddress: HCA,
        chainId: CHAIN_ID,
        // No client: the on-chain nonce stays unknown, so the marker decides.
        publicClient: undefined,
        activeSession: null,
        isActiveSessionRevoked: false,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  )
}

describe('useSessionAccessReset', () => {
  beforeEach(() => localStorage.clear())

  it('shows a reset saved or cleared by another mounted hook', () => {
    const first = renderTab()
    const second = renderTab()

    act(() => first.result.current.markSessionAccessReset(HCA, 2n))
    expect(second.result.current.isSessionAccessReset).toBe(true)

    act(() => first.result.current.clearSessionAccessReset(HCA))
    expect(second.result.current.isSessionAccessReset).toBe(false)
  })

  it('picks up a reset another tab wrote', () => {
    const tab = renderTab()
    expect(tab.result.current.isSessionAccessReset).toBe(false)

    act(() => {
      localStorage.setItem(
        'ens-session-reset-v1',
        JSON.stringify({ [`${CHAIN_ID}:${HCA.toLowerCase()}`]: '2' }),
      )
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'ens-session-reset-v1' }),
      )
    })
    expect(tab.result.current.isSessionAccessReset).toBe(true)
  })
})
