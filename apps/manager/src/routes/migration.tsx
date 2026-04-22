import { createFileRoute, redirect } from '@tanstack/react-router'
import { MigrationPage } from '@/features/migration/pages/MigrationPage'
import { MigrationUiProvider } from '@/features/migration/state/migrationUi.context'
import { isConnectedToPara } from '@/lib/para'

export const Route = createFileRoute('/migration')({
  component: () => (
    <MigrationUiProvider>
      <MigrationPage />
    </MigrationUiProvider>
  ),
  beforeLoad: () => {
    if (!isConnectedToPara()) throw redirect({ to: '/' })
  },
})
