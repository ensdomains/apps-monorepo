import { useFeatureFlagEnabled } from '@posthog/react'
import {
  createFileRoute,
  useHydrated,
  useNavigate,
} from '@tanstack/react-router'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useConnection } from 'wagmi'
import { MigrationPage } from '@/features/migration/pages/MigrationPage'
import { MigrationUiProvider } from '@/features/migration/state/migrationUi.context'
import { useOnDisconnected } from '@/features/wallet/hooks/useOnDisconnected'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { useSmartAccountContext } from '@/lib/smart-account'

export const Route = createFileRoute('/migration')({
  component: RouteComponent,
})

const FEATURE_FLAG_LOADING_TIMEOUT_MS = 3_000

const useMigrationAccessEnabled = (): boolean | undefined => {
  const enabled = useFeatureFlagEnabled(POSTHOG_FEATURE_FLAGS.MIGRATION)
  const [hasTimedOut, setHasTimedOut] = useState(false)

  useEffect(() => {
    if (enabled !== undefined || hasTimedOut) return

    const timeout = window.setTimeout(
      () => setHasTimedOut(true),
      FEATURE_FLAG_LOADING_TIMEOUT_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [enabled, hasTimedOut])

  return enabled ?? (hasTimedOut ? false : undefined)
}

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
  const { isConnecting, isReconnecting } = useConnection()
  const { hasInitialized, ownerAddress } = useSmartAccountContext()
  const migrationAccessEnabled = useMigrationAccessEnabled()

  const handleDisconnect = useCallback(() => {
    navigate({ to: '/', replace: true })
  }, [navigate])

  useOnDisconnected(handleDisconnect)

  const isRestoringConnection =
    !isHydrated || isConnecting || isReconnecting || !hasInitialized

  const redirectTo = (() => {
    if (isRestoringConnection) return null

    if (!ownerAddress) return null

    if (migrationAccessEnabled === false) {
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

  if (redirectTo) return null

  if (
    isRestoringConnection ||
    !ownerAddress ||
    migrationAccessEnabled === undefined
  ) {
    return <MigrationRouteLoading />
  }

  return <>{children}</>
}
