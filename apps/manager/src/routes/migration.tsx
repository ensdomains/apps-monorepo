import {
  createFileRoute,
  useHydrated,
  useNavigate,
} from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { useConnection } from 'wagmi'
import { MigrationPage } from '@/features/migration/pages/MigrationPage'
import { MigrationUiProvider } from '@/features/migration/state/migrationUi.context'
import { useSmartAccountContext } from '@/lib/smart-account'
import { isFeatureEnabled } from '@/utils/feature-flags'

export const Route = createFileRoute('/migration')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <RequireMigrationAccess>
      <MigrationUiProvider>
        <MigrationPage />
      </MigrationUiProvider>
    </RequireMigrationAccess>
  )
}

const MigrationRouteLoading = () => {
  return (
    <div
      aria-label="Loading migration"
      className="flex h-[calc(100dvh-80px)] min-h-0 w-full flex-1 items-center justify-center" // 80px is the md+ Manager header height.
      role="status"
    >
      <div
        className="size-5 animate-spin rounded-full border-2 border-ens-garnet-900/20 border-t-ens-garnet-900"
        data-testid="migration-loading-spinner"
      />
    </div>
  )
}

const RequireMigrationAccess = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate()
  const isHydrated = useHydrated()
  const { status, isConnecting, isReconnecting } = useConnection()
  const { hasInitialized, ownerAddress } = useSmartAccountContext()

  const isRestoringConnection =
    !isHydrated || isConnecting || isReconnecting || !hasInitialized

  const redirectTo = (() => {
    if (isRestoringConnection) return null

    if (status === 'disconnected') return null

    if (!ownerAddress) return null

    if (
      !isFeatureEnabled('MIGRATION', {
        walletAddress: ownerAddress,
      })
    ) {
      return '/dashboard'
    }

    return null
  })()

  useEffect(() => {
    if (!redirectTo) return

    navigate({
      to: redirectTo,
      replace: true,
    })
  }, [navigate, redirectTo])

  if (isRestoringConnection || status === 'disconnected' || !ownerAddress) {
    return <MigrationRouteLoading />
  }

  if (redirectTo) return null

  return <>{children}</>
}
