/**
 * SmartAccountContext Tests
 *
 * Tests for the React context provider and hooks.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: Test mocks require flexible typing
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './SmartAccountContext.mocks'

import { useWalletClient } from 'wagmi'
import { backendClient } from '@/utils/backend-client'
import { initializeRhinestoneAccount } from './rhinestone'
import {
  SmartAccountContextProvider,
  useSmartAccountContext,
  useSmartAccountContextSafe,
} from './SmartAccountContext'

const fundPost = backendClient.wallet.fund.$post as unknown as ReturnType<
  typeof vi.fn
>

i18n.loadAndActivate({ locale: 'en', messages: {} })

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SmartAccountContextProvider>{children}</SmartAccountContextProvider>
      </QueryClientProvider>
    </I18nProvider>
  )
}

describe('SmartAccountContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useSmartAccountContext', () => {
    it('throws error when used outside provider', () => {
      const queryClient = new QueryClient()
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )

      expect(() => {
        renderHook(() => useSmartAccountContext(), { wrapper })
      }).toThrow(
        'useSmartAccountContext must be used within SmartAccountProvider',
      )
    })

    it('returns context when used inside provider', () => {
      const { result } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      expect(result.current).toBeDefined()
      expect(result.current.type).toBe('rhinestone')
    })
  })

  describe('useSmartAccountContextSafe', () => {
    it('returns null when used outside provider', () => {
      const queryClient = new QueryClient()
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )

      const { result } = renderHook(() => useSmartAccountContextSafe(), {
        wrapper,
      })

      expect(result.current).toBeNull()
    })

    it('returns context when used inside provider', () => {
      const { result } = renderHook(() => useSmartAccountContextSafe(), {
        wrapper: createWrapper(),
      })

      expect(result.current).not.toBeNull()
      expect(result.current?.type).toBe('rhinestone')
    })
  })

  describe('wallet initialization', () => {
    it('initializes with no wallet connected', async () => {
      const { result } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.hasInitialized).toBe(true)
      })

      expect(result.current.isConnected).toBe(false)
      expect(result.current.client).toBeNull()
      expect(result.current.accountAddress).toBeNull()
    })

    it('initializes Rhinestone for external wallet', async () => {
      vi.mocked(useWalletClient).mockReturnValue({
        data: {
          account: { address: '0xExternalWallet12345678901234567890123456' },
        },
      } as any)

      const { result } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isAccountReady).toBe(true)
      })

      expect(initializeRhinestoneAccount).toHaveBeenCalled()
      expect(result.current.walletSource).toBe('external-wallet')
    })
  })

  describe('signer creation', () => {
    it('creates signer when client and address are available', async () => {
      vi.mocked(useWalletClient).mockReturnValue({
        data: {
          account: { address: '0xExternalWallet12345678901234567890123456' },
        },
      } as any)

      const { result } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isAccountReady).toBe(true)
      })

      expect(result.current.signer).not.toBeNull()
      expect(result.current.signer?.type).toBe('rhinestone')
    })

    it('returns null signer when not initialized', () => {
      const { result } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      expect(result.current.signer).toBeNull()
    })
  })

  describe('auto-funding', () => {
    beforeEach(() => {
      fundPost.mockReset()
    })

    // Regression for the auto-fund infinite loop: the balances query returns a
    // fresh `[]` (new ref) on most renders, and the mutation object/`mutate`
    // identity also churns. The effect must dedupe per balance *read* (a stable
    // `balancesUpdatedAt`), NOT per render or per mutation settle — otherwise it
    // re-fires every render and hammers the faucet.
    it('fires auto-fund once for a low balance and does not loop', async () => {
      vi.mocked(useWalletClient).mockReturnValue({
        data: {
          account: { address: '0xExternalWallet12345678901234567890123456' },
        },
      } as any)

      // Succeeds (txHash:null = faucet says already-funded / nothing minted),
      // which settles the mutation. A correctly-deduped effect must NOT keep
      // re-firing just because the mutation settled or the component re-rendered.
      fundPost.mockResolvedValue({ ok: true, json: () => ({ txHash: null }) })

      renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(fundPost).toHaveBeenCalledTimes(1)
      })

      // Settle + several render cycles must not produce more calls. (Before the
      // fix, the settle-counter bump made this climb without bound.)
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(fundPost).toHaveBeenCalledTimes(1)
    })

    // The in-flight mutation must not be re-triggered by render churn while it
    // is still pending.
    it('does not fire a fresh fund while one is in flight', async () => {
      vi.mocked(useWalletClient).mockReturnValue({
        data: {
          account: { address: '0xExternalWallet12345678901234567890123456' },
        },
      } as any)

      // Never resolves: the fund stays pending. Exactly one request in flight.
      fundPost.mockReturnValue(new Promise(() => {}))

      renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(fundPost).toHaveBeenCalledTimes(1)
      })
      // Give the effect time to (incorrectly) re-fire; it must not.
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(fundPost).toHaveBeenCalledTimes(1)
    })
  })
})
