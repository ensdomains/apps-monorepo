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

import { useClient, useWallet } from '@getpara/react-sdk-lite'
import { useWalletClient } from 'wagmi'
import { initializeRhinestoneAccount } from './rhinestone'
import {
  SmartAccountContextProvider,
  useSmartAccountContext,
  useSmartAccountContextSafe,
} from './SmartAccountContext'

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
      vi.mocked(useWallet).mockReturnValue({
        data: { isExternal: true },
        isPending: false,
      } as any)
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

    it('initializes Rhinestone for Para embedded wallet', async () => {
      vi.mocked(useWallet).mockReturnValue({
        data: { isExternal: false },
        isPending: false,
      } as any)
      vi.mocked(useClient).mockReturnValue({ isConnected: true } as any)

      const { result } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isAccountReady).toBe(true)
      })

      expect(initializeRhinestoneAccount).toHaveBeenCalled()
      expect(result.current.walletSource).toBe('para-embedded')
    })

    it('derives an owner wallet client for Para embedded wallets', async () => {
      // Para embedded wallets are not wagmi connectors, so `useWalletClient()`
      // stays null. The owner wallet client (used to EOA-sign the registrar's
      // payment approve) must instead be derived from the Para client, or HCA
      // registration silently reverts via the bundled approve+register path.
      vi.mocked(useWallet).mockReturnValue({
        data: { isExternal: false },
        isPending: false,
      } as any)
      vi.mocked(useClient).mockReturnValue({ isConnected: true } as any)
      vi.mocked(useWalletClient).mockReturnValue({ data: null } as any)

      const { result } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isAccountReady).toBe(true)
      })

      expect(result.current.walletClient).not.toBeNull()
    })
  })

  describe('signer creation', () => {
    it('creates signer when client and address are available', async () => {
      vi.mocked(useWallet).mockReturnValue({
        data: { isExternal: true },
        isPending: false,
      } as any)
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
})
