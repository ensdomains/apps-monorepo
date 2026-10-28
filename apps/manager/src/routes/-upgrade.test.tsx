import { render, screen } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection } from 'wagmi'
import { useOnDisconnected } from '@/features/wallet/hooks/useOnDisconnected'
import { useSmartAccountContext } from '@/lib/smart-account'
import { Route } from './upgrade'

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useNavigate: () => navigateMock,
}))

vi.mock('wagmi', () => ({
  useConnection: vi.fn(),
}))

vi.mock('@/features/wallet/hooks/useOnDisconnected', () => ({
  useOnDisconnected: vi.fn(),
}))

vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: vi.fn(),
}))

vi.mock('@/features/migration/pages/MigrationPage', () => ({
  MigrationPage: () => <div data-testid="migration-page" />,
}))

vi.mock('@/features/migration/state/migrationUi.context', () => ({
  MigrationUiProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="migration-provider">{children}</div>
  ),
}))

type ConnectionState = {
  status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected'
  isConnected?: boolean
  isConnecting: boolean
  isReconnecting: boolean
}

const OWNER_ADDRESS = '0x1111111111111111111111111111111111111111'

const mockConnection = (state: ConnectionState) => {
  vi.mocked(useConnection).mockReturnValue({
    isConnected: state.status === 'connected',
    ...state,
  } as ReturnType<typeof useConnection>)
}

const mockSmartAccount = (state: {
  isLoading?: boolean
  hasInitialized: boolean
  isConnected: boolean
  ownerAddress: string | null
}) => {
  vi.mocked(useSmartAccountContext).mockReturnValue({
    isLoading: false,
    ...state,
  } as ReturnType<typeof useSmartAccountContext>)
}

const renderRoute = () => {
  const Component = Route.options.component as ComponentType
  return render(<Component />)
}

describe('/upgrade route auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useOnDisconnected).mockImplementation(() => undefined)
    mockConnection({
      status: 'connected',
      isConnecting: false,
      isReconnecting: false,
    })
    mockSmartAccount({
      hasInitialized: true,
      isConnected: true,
      ownerAddress: OWNER_ADDRESS,
    })
  })

  it('waits during wallet restoration before rendering or redirecting', () => {
    mockConnection({
      status: 'reconnecting',
      isConnecting: false,
      isReconnecting: true,
    })
    mockSmartAccount({
      hasInitialized: false,
      isConnected: false,
      ownerAddress: null,
    })

    renderRoute()

    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('migration-page')).toBeNull()
  })

  it('renders migration when the smart account is connected even if wagmi reports the initial hard-load disconnected frame', () => {
    mockConnection({
      status: 'disconnected',
      isConnecting: false,
      isReconnecting: false,
    })

    renderRoute()

    expect(screen.getByTestId('migration-page')).not.toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('renders migration when wagmi is connected but the smart account is unavailable', () => {
    mockConnection({
      status: 'connected',
      isConnected: true,
      isConnecting: false,
      isReconnecting: false,
    })
    mockSmartAccount({
      hasInitialized: true,
      isConnected: false,
      ownerAddress: null,
    })

    renderRoute()

    expect(screen.getByTestId('migration-page')).not.toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('waits instead of redirecting on the initial hard-load disconnected frame', () => {
    mockConnection({
      status: 'disconnected',
      isConnecting: false,
      isReconnecting: false,
    })
    mockSmartAccount({
      hasInitialized: true,
      isConnected: false,
      ownerAddress: null,
    })

    renderRoute()

    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('migration-page')).toBeNull()
    expect(screen.getByTestId('migration-loading-spinner')).not.toBeNull()
  })

  it('redirects through the reconnect-aware disconnect hook', () => {
    vi.mocked(useOnDisconnected).mockImplementation((onDisconnect) => {
      onDisconnect()
    })

    renderRoute()

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/',
    })
  })
})
