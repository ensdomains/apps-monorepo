// biome-ignore-all lint/suspicious/noExplicitAny: test mocks need flexible typing
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnect, useConnections, useConnectors, useDisconnect } from 'wagmi'
import { setActivePrivyProvider } from './privy-connector'
import { usePrivySessionRuntime } from './usePrivySessionRuntime'
import { usePrivyWagmiBridge } from './usePrivyWagmiBridge'

vi.mock('wagmi', () => ({
  useConnect: vi.fn(),
  useConnections: vi.fn(),
  useConnectors: vi.fn(),
  useDisconnect: vi.fn(),
}))
vi.mock('./usePrivySessionRuntime', () => ({
  usePrivySessionRuntime: vi.fn(),
}))
vi.mock('./privy-connector', () => ({ setActivePrivyProvider: vi.fn() }))

const PRIVY_CONNECTOR = { id: 'privy', onAccountsChanged: vi.fn() } as any
const ADDRESS = '0x1234567890123456789012345678901234567890'
// What usePrivySession.getProvider() resolves to: the raw EIP-1193 provider +
// address the connector serves to wagmi.
const BINDING = { provider: {}, address: ADDRESS } as any

const connectAsync = vi.fn().mockResolvedValue(undefined)
const disconnectAsync = vi.fn().mockResolvedValue(undefined)

type SessionOverrides = Record<string, unknown>

const mockSession = (overrides: SessionOverrides = {}) => {
  vi.mocked(usePrivySessionRuntime).mockReturnValue({
    isConnected: true,
    ready: true,
    address: ADDRESS,
    hasEmbeddedWallet: false,
    busy: false,
    getProvider: vi.fn().mockResolvedValue(BINDING),
    createDefaultWallet: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any)
}

const mockWagmi = (connections: Array<{ connector: { id: string } }> = []) => {
  vi.mocked(useConnections).mockReturnValue(connections as any)
  vi.mocked(useConnectors).mockReturnValue([PRIVY_CONNECTOR] as any)
  vi.mocked(useConnect).mockReturnValue({ mutateAsync: connectAsync } as any)
  vi.mocked(useDisconnect).mockReturnValue({
    mutateAsync: disconnectAsync,
  } as any)
}

const flush = () => new Promise((r) => setTimeout(r, 20))

describe('usePrivyWagmiBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('installs the signer and connects Privy when session + address are present', async () => {
    mockSession()
    mockWagmi([])

    renderHook(() => usePrivyWagmiBridge())

    await waitFor(() =>
      expect(connectAsync).toHaveBeenCalledWith({ connector: PRIVY_CONNECTOR }),
    )
    expect(setActivePrivyProvider).toHaveBeenCalledWith(BINDING)
  })

  it('does nothing when there is no Privy session (external wallets are free)', async () => {
    mockSession({ isConnected: false })
    mockWagmi([])

    renderHook(() => usePrivyWagmiBridge())
    await flush()

    expect(connectAsync).not.toHaveBeenCalled()
  })

  it('creates a wallet for a NEW user (session, no address, no existing wallet)', async () => {
    const createDefaultWallet = vi.fn().mockResolvedValue(undefined)
    mockSession({
      address: null,
      hasEmbeddedWallet: false,
      createDefaultWallet,
    })
    mockWagmi([])

    renderHook(() => usePrivyWagmiBridge())

    await waitFor(() => expect(createDefaultWallet).toHaveBeenCalledTimes(1))
    expect(connectAsync).not.toHaveBeenCalled() // no address yet → wait
  })

  it('does NOT call createWallet for a RETURNING user; waits then connects once the address surfaces', async () => {
    const createDefaultWallet = vi.fn().mockResolvedValue(undefined)
    mockSession({ address: null, hasEmbeddedWallet: true, createDefaultWallet })
    mockWagmi([])

    const { rerender } = renderHook(() => usePrivyWagmiBridge())
    await flush()

    // The wallet exists per the user object — skip the createWallet round-trip.
    expect(createDefaultWallet).not.toHaveBeenCalled()
    expect(connectAsync).not.toHaveBeenCalled() // no address yet → wait

    // useWallets() finally surfaces the existing wallet's address.
    mockSession({ address: ADDRESS, hasEmbeddedWallet: true })
    rerender()

    await waitFor(() =>
      expect(connectAsync).toHaveBeenCalledWith({ connector: PRIVY_CONNECTOR }),
    )
    expect(createDefaultWallet).not.toHaveBeenCalled()
  })

  it('handles the "already has wallet" error as a fallback (no loop)', async () => {
    const createDefaultWallet = vi
      .fn()
      .mockRejectedValue(new Error('User already has an embedded wallet'))
    // hasEmbeddedWallet false → createWallet is attempted, then throws.
    mockSession({
      address: null,
      hasEmbeddedWallet: false,
      createDefaultWallet,
    })
    mockWagmi([])

    const { rerender } = renderHook(() => usePrivyWagmiBridge())
    await waitFor(() => expect(createDefaultWallet).toHaveBeenCalledTimes(1))

    mockSession({ address: ADDRESS, hasEmbeddedWallet: true })
    rerender()

    await waitFor(() =>
      expect(connectAsync).toHaveBeenCalledWith({ connector: PRIVY_CONNECTOR }),
    )
    expect(createDefaultWallet).toHaveBeenCalledTimes(1) // did not loop
  })

  it('retries a non-benign createWallet failure, then signs out to recover (no deadlock)', async () => {
    const createDefaultWallet = vi
      .fn()
      .mockRejectedValue(new Error('embedded wallets are disabled'))
    const logout = vi.fn().mockResolvedValue(undefined)
    mockSession({
      address: null,
      hasEmbeddedWallet: false,
      createDefaultWallet,
      logout,
    })
    mockWagmi([])

    renderHook(() => usePrivyWagmiBridge())

    // Retries up to the cap, then logs out instead of latching "creating"
    // forever (which would strand the user on infinite /dashboard loading).
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
    expect(createDefaultWallet).toHaveBeenCalledTimes(3) // MAX_CREATE_ATTEMPTS
    expect(connectAsync).not.toHaveBeenCalled()
  })

  it('does not connect Privy while an external wallet is connected', async () => {
    mockSession()
    mockWagmi([{ connector: { id: 'io.metamask' } }])

    renderHook(() => usePrivyWagmiBridge())
    await flush()

    expect(connectAsync).not.toHaveBeenCalled()
  })

  it('does not re-connect when already connected to Privy', async () => {
    mockSession()
    mockWagmi([{ connector: { id: 'privy' } }])

    renderHook(() => usePrivyWagmiBridge())
    await flush()

    expect(connectAsync).not.toHaveBeenCalled()
  })

  it('rebinds the provider (without reconnecting) when the address changes while already connected', async () => {
    const ADDRESS_2 = '0x000000000000000000000000000000000000beef'
    const BINDING_2 = { provider: {}, address: ADDRESS_2 } as any
    const getProvider = vi.fn().mockResolvedValue(BINDING_2)
    // Already connected to the privy connector, bound to a DIFFERENT address.
    mockSession({ address: ADDRESS_2, getProvider })
    mockWagmi([{ connector: { id: 'privy' } }])

    renderHook(() => usePrivyWagmiBridge())

    // The module-level binding must be refreshed for the new address, and wagmi
    // told the account changed — but we must NOT spin up a second connection.
    await waitFor(() =>
      expect(PRIVY_CONNECTOR.onAccountsChanged).toHaveBeenCalledWith([
        ADDRESS_2,
      ]),
    )
    expect(getProvider).toHaveBeenCalled()
    expect(setActivePrivyProvider).toHaveBeenCalledWith(BINDING_2)
    expect(connectAsync).not.toHaveBeenCalled()
  })

  it('tears down the Privy connection when the session ends', async () => {
    mockSession({ isConnected: false, ready: true })
    mockWagmi([{ connector: { id: 'privy' } }])

    renderHook(() => usePrivyWagmiBridge())

    await waitFor(() =>
      expect(disconnectAsync).toHaveBeenCalledWith({
        connector: { id: 'privy' },
      }),
    )
    expect(setActivePrivyProvider).toHaveBeenCalledWith(null)
  })
})
