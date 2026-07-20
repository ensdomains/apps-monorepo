import {
  createFileRoute,
  redirect,
  useHydrated,
  useNavigate,
} from '@tanstack/react-router'
import { type ReactNode, useCallback } from 'react'
import { useConnection } from 'wagmi'
import { MigrationPage } from '@/features/migration/pages/MigrationPage'
import { MigrationUiProvider } from '@/features/migration/state/migrationUi.context'
import { useOnDisconnected } from '@/features/wallet/hooks/useOnDisconnected'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { getFeatureFlag } from '@/lib/posthog/get-feature-flag'
import { useSmartAccountContext } from '@/lib/smart-account'

export const Route = createFileRoute('/migration')({
  beforeLoad: async () => {
    // Gate direct requests during SSR without adding a PostHog round trip to
    // client-side navigation. This flag controls rollout, not authorization.
    if (typeof window !== 'undefined') return

    const migrationAccess = await getFeatureFlag({
      data: { flag: POSTHOG_FEATURE_FLAGS.MIGRATION },
    })

    if (migrationAccess === false) {
      throw redirect({ to: '/dashboard', replace: true })
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <RequireConnectedWallet>
      <MigrationUiProvider>
        <MigrationPage />
      </MigrationUiProvider>
    </RequireConnectedWallet>
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

const RequireConnectedWallet = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate()
  const isHydrated = useHydrated()
  const { isConnecting, isReconnecting } = useConnection()
  const { hasInitialized, ownerAddress } = useSmartAccountContext()

  const handleDisconnect = useCallback(() => {
    navigate({ to: '/', replace: true })
  }, [navigate])

  useOnDisconnected(handleDisconnect)

  const isRestoringConnection =
    !isHydrated || isConnecting || isReconnecting || !hasInitialized

  if (isRestoringConnection || !ownerAddress) {
    return <MigrationRouteLoading />
  }

  return <>{children}</>
}
