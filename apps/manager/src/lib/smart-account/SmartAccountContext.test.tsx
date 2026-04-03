/**
 * SmartAccountContext Tests
 *
 * Tests for the React context provider and hooks.
 */

// biome-ignore-all lint/suspicious/noExplicitAny: Test mocks require flexible typing
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './SmartAccountContext.mocks'

import { useClient, useWallet } from '@getpara/react-sdk-lite'
import { useWalletClient } from 'wagmi'
import { initializePimlicoAccount } from './pimlico'
import {
  SmartAccountContextProvider,
  useSmartAccountContext,
  useSmartAccountContextSafe,
} from './SmartAccountContext'
import { initializeZeroDevAccount } from './zerodev/kernel'

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
      expect(result.current.type).toBe('zerodev')
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
      expect(result.current?.type).toBe('zerodev')
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

    it('initializes ZeroDev for external wallet', async () => {
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

      expect(initializeZeroDevAccount).toHaveBeenCalled()
      expect(result.current.walletSource).toBe('external-wallet')
    })

    it('initializes Pimlico for Para embedded wallet', async () => {
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

      expect(initializePimlicoAccount).toHaveBeenCalled()
      expect(result.current.walletSource).toBe('para-embedded')
    })
  })

  describe('session management', () => {
    it('setSessionData updates session state for external wallets', async () => {
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

      const mockSession = {
        id: 'session-123',
        sessionKeyAddress: '0xSessionKey' as const,
        smartAccountAddress: '0xSmartAccount' as const,
        ownerAddress: '0xOwner' as const,
        createdAt: Date.now(),
        chainId: 11155111,
        serializedSessionAccount: 'data',
        sessionPrivateKey: '0xkey' as const,
      }

      const mockSessionClient = { account: { address: '0xSession' } } as any

      act(() => {
        result.current.setSessionData(mockSession, mockSessionClient)
      })

      await waitFor(() => {
        expect(result.current.session).toEqual(mockSession)
        expect(result.current.isSessionClient).toBe(true)
      })
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
      expect(result.current.signer?.type).toBe('zerodev')
    })

    it('returns null signer when not initialized', () => {
      const { result } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      expect(result.current.signer).toBeNull()
    })
  })
})
