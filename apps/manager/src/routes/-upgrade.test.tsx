import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { useHydrated } from '@tanstack/react-router'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection } from 'wagmi'
import { useOnDisconnected } from '@/features/wallet/hooks/useOnDisconnected'
import { useSmartAccountContext } from '@/lib/smart-account'
import { Route } from './upgrade'

const navigateMock = vi.hoisted(() => vi.fn())
const openConnectModalMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/wallet', () => ({
  useConnectModal: () => ({ openConnectModal: openConnectModalMock }),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useHydrated: vi.fn(),
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
  isConnecting: boolean
  isReconnecting: boolean
}

const OWNER_ADDRESS = '0x1111111111111111111111111111111111111111'

const mockConnection = (state: ConnectionState) => {
  // biome-ignore lint/suspicious/noExplicitAny: only the fields the route reads matter.
  vi.mocked(useConnection).mockReturnValue(state as any)
}

const mockSmartAccount = (state: {
  hasInitialized: boolean
  isConnected: boolean
  ownerAddress: string | null
}) => {
  // biome-ignore lint/suspicious/noExplicitAny: only the fields the route reads matter.
  vi.mocked(useSmartAccountContext).mockReturnValue(state as any)
}

const renderRoute = () => {
  const Component = Route.options.component as ComponentType
  return render(<Component />, {
    wrapper: ({ children }) => (
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    ),
  })
}

describe('/upgrade route auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    i18n.loadAndActivate({ locale: 'en', messages: {} })
    vi.mocked(useHydrated).mockReturnValue(true)
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

    const { rerender } = renderRoute()

    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('migration-page')).toBeNull()

    mockConnection({
      status: 'disconnected',
      isConnecting: false,
      isReconnecting: false,
    })
    const Component = Route.options.component as ComponentType
    rerender(<Component />)

    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('migration-loading-spinner')).not.toBeNull()
  })

  it('does not redirect before the router has hydrated, even if wagmi initially reports disconnected', () => {
    vi.mocked(useHydrated).mockReturnValue(false)
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

  it('does not redirect while wagmi is connected but the smart account is still catching up', () => {
    mockSmartAccount({
      hasInitialized: true,
      isConnected: false,
      ownerAddress: null,
    })

    const { rerender } = renderRoute()

    expect(screen.getByTestId('migration-loading-spinner')).not.toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()

    mockSmartAccount({
      hasInitialized: true,
      isConnected: false,
      ownerAddress: OWNER_ADDRESS,
    })
    const Component = Route.options.component as ComponentType
    rerender(<Component />)

    expect(screen.getByTestId('migration-page')).not.toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('offers wallet connection to a disconnected visitor without an owner after restoration finishes', () => {
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
    expect(screen.queryByTestId('migration-loading-spinner')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Connect Wallet' }))
    expect(openConnectModalMock).toHaveBeenCalledOnce()
  })

  it('redirects through the reconnect-aware disconnect hook', () => {
    vi.mocked(useOnDisconnected).mockImplementation((onDisconnect) => {
      onDisconnect()
    })

    renderRoute()

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/',
      replace: true,
    })
  })
})
