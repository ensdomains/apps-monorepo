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

// WEB-287: keep all the real session-storage helpers (the context imports
// several) but spy on `removeSessionsByOwner` to assert cross-EOA eviction.
vi.mock('@ens-apps/smart-account', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ens-apps/smart-account')>()
  return {
    ...actual,
    removeSessionsByOwner: vi.fn(),
    // WEB-674: the on-chain revoke is a real owner transaction; stub it so the
    // context's success/failure branches can be exercised without a chain.
    revokeSessionsOnChain: vi.fn(),
    // Deploy-and-revoke reads the account's init data; pin what it is asked
    // for rather than depending on the mocked SDK client's shape.
    buildHcaDeploymentCall: vi.fn(),
  }
})

// Enabling a session would prompt the wallet; resolve it to a stored session.
vi.mock('./actors/session.actors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./actors/session.actors')>()),
  resolveSessionActor: vi.fn(),
}))

// Auto-fund only runs against a local Anvil fork; enable that path but keep the
// Anvil owner setup itself out of these tests.
vi.mock('@ens-apps/dev-time-travel', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ens-apps/dev-time-travel')>()
  return {
    ...actual,
    isTimeTravelEnabled: () => true,
    anvilSetupOwner: vi.fn().mockResolvedValue(undefined),
  }
})

import {
  buildHcaDeploymentCall,
  HcaDeploymentCallValidationError,
  type RhinestoneStoredSession,
  removeSessionsByOwner,
  revokeSessionsOnChain,
  SessionRevokeError,
} from '@ens-apps/smart-account'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import { errAsync, okAsync } from 'neverthrow'
import type { Address, WalletClient } from 'viem'
import { useWalletClient } from 'wagmi'
import { chain as appChain } from '@/config'
import { backendClient } from '@/utils/backend-client'
import { resolveSessionActor } from './actors/session.actors'
import {
  initializeRhinestoneAccount,
  type RhinestoneInitResult,
} from './rhinestone'
import {
  SmartAccountContextProvider,
  useSmartAccountContext,
  useSmartAccountContextSafe,
} from './SmartAccountContext'

const removeSessionsByOwnerMock =
  removeSessionsByOwner as unknown as ReturnType<typeof vi.fn>

const revokeSessionsOnChainMock =
  revokeSessionsOnChain as unknown as ReturnType<typeof vi.fn>

const buildHcaDeploymentCallMock =
  buildHcaDeploymentCall as unknown as ReturnType<typeof vi.fn>

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
    // The reset marker persists, so one test's reset must not leak into the next.
    localStorage.clear()
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

  // WEB-287 / EXP-RHN-003: a session enabled by owner A on a shared device must
  // not survive a switch to owner B. When the connected EOA changes, the
  // previous owner's stored session is evicted.
  describe('cross-EOA session eviction', () => {
    const EOA_A = '0xAAAA000000000000000000000000000000000001'
    const EOA_B = '0xBBBB000000000000000000000000000000000002'

    beforeEach(() => {
      removeSessionsByOwnerMock.mockClear()
    })

    it('evicts the previous owner session when the connected EOA changes', async () => {
      vi.mocked(useWalletClient).mockReturnValue({
        data: { account: { address: EOA_A } },
      } as any)

      const { rerender } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      // Owner A connects and initializes — no eviction yet.
      await waitFor(() => {
        expect(initializeRhinestoneAccount).toHaveBeenCalled()
      })
      expect(removeSessionsByOwnerMock).not.toHaveBeenCalled()

      // Switch the connected wallet to owner B.
      vi.mocked(useWalletClient).mockReturnValue({
        data: { account: { address: EOA_B } },
      } as any)
      rerender()

      // The previous owner (A) — and only A — has its session evicted.
      await waitFor(() => {
        expect(removeSessionsByOwnerMock).toHaveBeenCalledWith(EOA_A)
      })
      expect(removeSessionsByOwnerMock).not.toHaveBeenCalledWith(EOA_B)
    })

    it('does NOT evict on a transient disconnect (eoa → null)', async () => {
      // A disconnect blip (wagmi briefly reports null during reconnect / HMR /
      // tab focus) must NOT wipe the owner's session — that forced a needless
      // re-ENABLE on every reconnect. The session survives so the next action
      // reuses it prompt-free (per the HCA handoff doc). Cross-owner safety is
      // preserved by the different-EOA-switch case above.
      vi.mocked(useWalletClient).mockReturnValue({
        data: { account: { address: EOA_A } },
      } as any)

      const { rerender } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      // Owner A connects and initializes — no eviction yet.
      await waitFor(() => {
        expect(initializeRhinestoneAccount).toHaveBeenCalled()
      })
      expect(removeSessionsByOwnerMock).not.toHaveBeenCalled()

      // Disconnect: wagmi reports no wallet client (eoaAddress → null).
      vi.mocked(useWalletClient).mockReturnValue({ data: null } as any)
      rerender()

      // No eviction on the null blip.
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(removeSessionsByOwnerMock).not.toHaveBeenCalled()

      // Reconnecting the SAME owner still must not evict.
      vi.mocked(useWalletClient).mockReturnValue({
        data: { account: { address: EOA_A } },
      } as any)
      rerender()
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(removeSessionsByOwnerMock).not.toHaveBeenCalled()
    })

    it('does NOT evict on a plain re-render with the same EOA', async () => {
      vi.mocked(useWalletClient).mockReturnValue({
        data: { account: { address: EOA_A } },
      } as any)

      const { rerender } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(initializeRhinestoneAccount).toHaveBeenCalled()
      })

      rerender()
      rerender()

      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(removeSessionsByOwnerMock).not.toHaveBeenCalled()
    })
  })

  describe('session revocation (WEB-674)', () => {
    const WALLET = '0xExternalWallet12345678901234567890123456'
    const connectWallet = async () => {
      vi.mocked(useWalletClient).mockReturnValue({
        data: { account: { address: WALLET } },
      } as any)
      const { result } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })
      await waitFor(() => {
        expect(result.current.isAccountReady).toBe(true)
      })
      return result
    }

    it('reports success and drops the in-memory session once the receipt confirms', async () => {
      revokeSessionsOnChainMock.mockReturnValue(
        okAsync({ transactionHash: `0x${'ab'.repeat(32)}`, sessionNonce: 1n }),
      )
      const result = await connectWallet()

      let revoked: boolean | undefined
      await act(async () => {
        revoked = await result.current.revokeSession()
      })

      expect(revoked).toBe(true)
      expect(revokeSessionsOnChainMock).toHaveBeenCalledTimes(1)
      // A plain revoke never deploys: that is a second, opt-in transaction.
      expect(buildHcaDeploymentCallMock).not.toHaveBeenCalled()
      expect(revokeSessionsOnChainMock.mock.calls[0]?.[0]).toMatchObject({
        hca: result.current.accountAddress,
        chain: { id: 11155111 },
      })
      expect(revokeSessionsOnChainMock.mock.calls[0]?.[0]).not.toHaveProperty(
        'deploymentCall',
      )
      expect(result.current.activeStoredSession).toBeNull()
      expect(result.current.revokeError).toBeNull()
      expect(result.current.isRevokingSession).toBe(false)
    })

    it('marks access as reset only after a confirmed revoke, so it is not offered twice', async () => {
      revokeSessionsOnChainMock
        .mockReturnValueOnce(
          errAsync(
            new SessionRevokeError({
              message: 'revokeSessions transaction reverted',
              reason: 'transaction-failed',
            }),
          ),
        )
        .mockReturnValueOnce(
          okAsync({
            transactionHash: `0x${'ab'.repeat(32)}`,
            sessionNonce: 1n,
          }),
        )
      const result = await connectWallet()
      expect(result.current.isSessionAccessReset).toBe(false)

      await act(async () => {
        await result.current.revokeSession()
      })
      expect(result.current.isSessionAccessReset).toBe(false)

      await act(async () => {
        await result.current.revokeSession()
      })
      expect(result.current.isSessionAccessReset).toBe(true)
    })

    it('keeps access marked as reset after a reload', async () => {
      revokeSessionsOnChainMock.mockReturnValue(
        okAsync({ transactionHash: `0x${'ab'.repeat(32)}`, sessionNonce: 1n }),
      )
      const result = await connectWallet()
      await act(async () => {
        await result.current.revokeSession()
      })
      expect(result.current.isSessionAccessReset).toBe(true)

      // A fresh provider is what a page reload gets.
      const reloaded = await connectWallet()
      await waitFor(() =>
        expect(reloaded.current.isSessionAccessReset).toBe(true),
      )
    })

    it('offers reset again once a session is signed after it, even if this copy is forgotten', async () => {
      // Valid addresses: enabling a session needs the machine owner and the
      // connected wallet to agree.
      const OWNER: Address = '0x1111111111111111111111111111111111111111'
      const HCA: Address = '0x2222222222222222222222222222222222222222'
      // Only the client methods the session path calls.
      const client: Pick<RhinestoneAccount, 'getAddress' | 'isDeployed'> = {
        getAddress: () => HCA,
        isDeployed: async () => true,
      }
      vi.mocked(initializeRhinestoneAccount).mockResolvedValueOnce({
        client,
        address: HCA,
        ownerAddress: OWNER,
        alreadyDeployed: true,
        config: { chain: appChain },
      } as RhinestoneInitResult)
      const walletClient: Pick<WalletClient, 'account'> = {
        account: { address: OWNER, type: 'json-rpc' },
      }
      vi.mocked(useWalletClient).mockReturnValue({
        data: walletClient,
      } as ReturnType<typeof useWalletClient>)
      const session = {
        id: 'session-after-reset',
        provider: 'rhinestone',
        sessionKeyAddress: '0x9999999999999999999999999999999999999999',
        smartAccountAddress: HCA,
        ownerAddress: OWNER,
        createdAt: Date.now(),
        chainId: 11155111,
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        sessionPrivateKey: `0x${'1'.repeat(64)}`,
        permissionId: `0x${'2'.repeat(64)}`,
        resolver: '0x3333333333333333333333333333333333333333',
        hcaSessionNonce: '1',
        authorization: `0x${'4'.repeat(130)}`,
        hashesAndChainIds: [
          { chainId: '11155111', sessionDigest: `0x${'5'.repeat(64)}` },
        ],
        sessionToEnableIndex: 0,
      } satisfies RhinestoneStoredSession
      vi.mocked(resolveSessionActor).mockReturnValue(okAsync({ session }))
      revokeSessionsOnChainMock.mockReturnValue(
        okAsync({ transactionHash: `0x${'ab'.repeat(32)}`, sessionNonce: 1n }),
      )
      const { result } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })
      await waitFor(() => expect(result.current.accountAddress).toBe(HCA))

      await act(async () => {
        await result.current.revokeSession()
      })
      expect(result.current.isSessionAccessReset).toBe(true)

      let status: string | undefined
      await act(async () => {
        status = (await result.current.enableSession()).status
      })
      expect(status).toBe('enabled')
      expect(result.current.hasActiveSession).toBe(true)

      // The session signed after the reset may have been copied elsewhere, so
      // dropping this browser's copy must not hide the reset.
      await act(async () => {
        result.current.forgetLocalSession()
      })
      expect(result.current.hasActiveSession).toBe(false)
      expect(result.current.isSessionAccessReset).toBe(false)
    })

    it('deploys first when asked, with a deployment built for the connected wallet', async () => {
      const deploymentCall = { to: '0xFactory', value: 0n, data: '0xdead' }
      buildHcaDeploymentCallMock.mockReturnValueOnce(deploymentCall)
      revokeSessionsOnChainMock.mockReturnValue(
        okAsync({
          transactionHash: `0x${'ab'.repeat(32)}`,
          sessionNonce: 1n,
          deploymentTransactionHash: `0x${'cd'.repeat(32)}`,
        }),
      )
      const result = await connectWallet()

      let revoked: boolean | undefined
      await act(async () => {
        revoked = await result.current.revokeSession({ deployFirst: true })
      })

      expect(revoked).toBe(true)
      expect(buildHcaDeploymentCallMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 11155111,
          expectedHca: result.current.accountAddress,
          expectedOwner: WALLET,
        }),
      )
      expect(revokeSessionsOnChainMock.mock.calls[0]?.[0]).toMatchObject({
        deploymentCall,
      })
    })

    it('refuses to deploy for a wallet that does not own the account', async () => {
      buildHcaDeploymentCallMock.mockImplementationOnce(() => {
        throw new HcaDeploymentCallValidationError({
          field: 'owner',
          expected: WALLET,
          actual: '0xSomeoneElse',
        })
      })
      const result = await connectWallet()

      let revoked: boolean | undefined
      await act(async () => {
        revoked = await result.current.revokeSession({ deployFirst: true })
      })

      expect(revoked).toBe(false)
      // Nothing is sent: a mismatch must not cost the user a deployment.
      expect(revokeSessionsOnChainMock).not.toHaveBeenCalled()
      expect(result.current.revokeErrorReason).toBe('not-owner')
      expect(result.current.isRevokingSession).toBe(false)
    })

    it('surfaces a localized error and stays failed when the revoke reverts', async () => {
      revokeSessionsOnChainMock.mockReturnValue(
        errAsync(
          new SessionRevokeError({
            message: 'revokeSessions transaction reverted',
            reason: 'transaction-failed',
          }),
        ),
      )
      const result = await connectWallet()

      let revoked: boolean | undefined
      await act(async () => {
        revoked = await result.current.revokeSession()
      })

      expect(revoked).toBe(false)
      expect(result.current.revokeError).toBeTruthy()
      // The raw chain message must not leak to the user.
      expect(result.current.revokeError).not.toContain('revokeSessions')
      expect(result.current.revokeErrorReason).toBe('transaction-failed')
      expect(result.current.isRevokingSession).toBe(false)
    })

    it('exposes the not-deployed reason so the UI can offer deploy-and-revoke or a local clear', async () => {
      revokeSessionsOnChainMock.mockReturnValue(
        errAsync(
          new SessionRevokeError({
            message: 'HCA is not deployed',
            reason: 'not-deployed',
          }),
        ),
      )
      const result = await connectWallet()

      await act(async () => {
        await result.current.revokeSession()
      })

      expect(result.current.revokeErrorReason).toBe('not-deployed')

      // The escape hatch clears local state without claiming a revocation.
      await act(async () => {
        result.current.forgetLocalSession()
      })
      expect(result.current.activeStoredSession).toBeNull()
      expect(result.current.revokeError).toBeNull()
      expect(result.current.revokeErrorReason).toBeNull()
    })
  })
})
