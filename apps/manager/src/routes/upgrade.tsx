import { Trans } from '@lingui/react/macro'
import {
  createFileRoute,
  useHydrated,
  useNavigate,
} from '@tanstack/react-router'
import { type ReactNode, useCallback } from 'react'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ens-consumer/button/Button'
import { MigrationPage } from '@/features/migration/pages/MigrationPage'
import { MigrationUiProvider } from '@/features/migration/state/migrationUi.context'
import { useOnDisconnected } from '@/features/wallet/hooks/useOnDisconnected'
import { useSmartAccountContext } from '@/lib/smart-account'
import { useConnectModal } from '@/lib/wallet'

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
  const isHydrated = useHydrated()
  const { status, isConnecting, isReconnecting } = useConnection()
  const { hasInitialized, ownerAddress } = useSmartAccountContext()
  const { openConnectModal } = useConnectModal()

  const handleDisconnect = useCallback(() => {
    navigate({ to: '/', replace: true })
  }, [navigate])

  useOnDisconnected(handleDisconnect)

  const isRestoringConnection =
    !isHydrated || isConnecting || isReconnecting || !hasInitialized
  if (isRestoringConnection || (!ownerAddress && status !== 'disconnected')) {
    return <MigrationRouteLoading />
  }

  if (!ownerAddress) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <Button onClick={openConnectModal}>
          <Trans>Connect Wallet</Trans>
        </Button>
      </div>
    )
  }

  return <>{children}</>
}
