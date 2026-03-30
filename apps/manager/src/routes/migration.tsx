import { createFileRoute, redirect } from '@tanstack/react-router'
import { MigrationPage } from '@/features/migration/pages/MigrationPage'
import { isConnectedToPara } from '@/lib/para'

export const Route = createFileRoute('/migration')({
  component: MigrationPage,
  beforeLoad: () => {
    if (!isConnectedToPara()) throw redirect({ to: '/' })
  },
})
