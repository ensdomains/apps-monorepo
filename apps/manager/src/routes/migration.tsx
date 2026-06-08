import { createFileRoute, redirect } from '@tanstack/react-router'
import { MigrationPage } from '@/features/migration/pages/MigrationPage'
import { MigrationUiProvider } from '@/features/migration/state/migrationUi.context'
import { getConnectionCookie } from '@/lib/connection-cookie'
import { isFeatureEnabled } from '@/utils/feature-flags'

export const Route = createFileRoute('/migration')({
  component: () => (
    <MigrationUiProvider>
      <MigrationPage />
    </MigrationUiProvider>
  ),
  beforeLoad: () => {
    const connectedAddress = getConnectionCookie()

    if (!connectedAddress) throw redirect({ to: '/' })

    if (
      !isFeatureEnabled('MIGRATION', {
        walletAddress: connectedAddress,
      })
    ) {
      throw redirect({ to: '/dashboard' })
    }
  },
})
