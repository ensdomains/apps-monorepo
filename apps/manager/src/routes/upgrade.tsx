import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useConnection } from 'wagmi'
import { MigrationPage } from '@/features/migration/pages/MigrationPage'
import { MigrationUiProvider } from '@/features/migration/state/migrationUi.context'
import { useOnDisconnected } from '@/features/wallet/hooks/useOnDisconnected'
import { useSmartAccountContext } from '@/lib/smart-account'

export const Route = createFileRoute('/upgrade')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <MigrationUiProvider>
      <RequireConnectedWallet>
        <MigrationPage />
      </RequireConnectedWallet>
    </MigrationUiProvider>
  )
}

const MigrationRouteLoading = () => {
  return (
    <div
      aria-label="Loading upgrade"
      className="flex min-h-0 w-full flex-1 items-center justify-center"
      role="status"
    >
      <div
        className="size-5 animate-spin rounded-full border-2 border-ens-garnet-900/20 border-t-ens-garnet-900"
        data-testid="migration-loading-spinner"
      />
    </div>
  )
}

const RequireConnectedWallet = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate()
  const {
    isConnected: isWalletConnected,
    isConnecting,
    isReconnecting,
  } = useConnection()
  const { isLoading, hasInitialized, isConnected } = useSmartAccountContext()

  useOnDisconnected(() => {
    navigate({ to: '/' })
  })

  if (isLoading || !hasInitialized || isConnecting || isReconnecting) {
    return <MigrationRouteLoading />
  }

  if (!isConnected && !isWalletConnected) {
    return <MigrationRouteLoading />
  }

  return <>{children}</>
}
