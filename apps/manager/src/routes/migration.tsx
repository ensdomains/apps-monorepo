import { createFileRoute, redirect } from '@tanstack/react-router'
import { MigrationPage } from '@/features/migration/pages/MigrationPage'
import { MigrationUiProvider } from '@/features/migration/state/migrationUi.context'
import { getParaConnectionCookie } from '@/lib/para'
import { isFeatureEnabled } from '@/utils/feature-flags'

export const Route = createFileRoute('/migration')({
  component: () => (
    <MigrationUiProvider>
      <MigrationPage />
    </MigrationUiProvider>
  ),
  beforeLoad: () => {
    const connectedAddress = getParaConnectionCookie()

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
