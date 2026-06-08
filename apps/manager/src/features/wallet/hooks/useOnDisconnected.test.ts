import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection } from 'wagmi'
import { useOnDisconnected } from './useOnDisconnected'

vi.mock('wagmi', () => ({
  useConnection: vi.fn(),
  // The transition-based listener is wagmi's own; stub it out so these tests
  // isolate the status-derived effect we added.
  useConnectionEffect: vi.fn(),
}))

type ConnectionState = {
  status: 'connected' | 'reconnecting' | 'connecting' | 'disconnected'
  isConnecting: boolean
  isReconnecting: boolean
}

const mockConnection = (state: ConnectionState) => {
  // biome-ignore lint/suspicious/noExplicitAny: only the fields the hook reads matter
  vi.mocked(useConnection).mockReturnValue(state as any)
}

describe('useOnDisconnected', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not fire while reconnecting (the window that caused the blank screen)', () => {
    mockConnection({
      status: 'reconnecting',
      isConnecting: false,
      isReconnecting: true,
    })
    const onDisconnect = vi.fn()

    renderHook(() => useOnDisconnected(onDisconnect))

    expect(onDisconnect).not.toHaveBeenCalled()
  })

  it('does not fire while connecting', () => {
    mockConnection({
      status: 'connecting',
      isConnecting: true,
      isReconnecting: false,
    })
    const onDisconnect = vi.fn()

    renderHook(() => useOnDisconnected(onDisconnect))

    expect(onDisconnect).not.toHaveBeenCalled()
  })

  it('does not fire when connected', () => {
    mockConnection({
      status: 'connected',
      isConnecting: false,
      isReconnecting: false,
    })
    const onDisconnect = vi.fn()

    renderHook(() => useOnDisconnected(onDisconnect))

    expect(onDisconnect).not.toHaveBeenCalled()
  })

  it('fires once when settled-disconnected', () => {
    mockConnection({
      status: 'disconnected',
      isConnecting: false,
      isReconnecting: false,
    })
    const onDisconnect = vi.fn()

    renderHook(() => useOnDisconnected(onDisconnect))

    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire across the reconnect → connected transition (the bug)', () => {
    mockConnection({
      status: 'reconnecting',
      isConnecting: false,
      isReconnecting: true,
    })
    const onDisconnect = vi.fn()

    const { rerender } = renderHook(() => useOnDisconnected(onDisconnect))

    // wagmi finishes reconnecting; the smart-account machine may still be
    // syncing, but the wallet IS connected — we must not bounce to landing.
    mockConnection({
      status: 'connected',
      isConnecting: false,
      isReconnecting: false,
    })
    rerender()

    expect(onDisconnect).not.toHaveBeenCalled()
  })

  it('fires when a reconnect attempt ultimately fails (genuine disconnect)', () => {
    mockConnection({
      status: 'reconnecting',
      isConnecting: false,
      isReconnecting: true,
    })
    const onDisconnect = vi.fn()

    const { rerender } = renderHook(() => useOnDisconnected(onDisconnect))
    expect(onDisconnect).not.toHaveBeenCalled()

    mockConnection({
      status: 'disconnected',
      isConnecting: false,
      isReconnecting: false,
    })
    rerender()

    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })
})
