import { createFileRoute, redirect } from '@tanstack/react-router'
import { MigrationPage } from '@/features/migration/pages/MigrationPage'
import { isConnectedToPara } from '@/lib/para'
import { isFeatureEnabled } from '@/utils/feature-flags'

export const Route = createFileRoute('/migration')({
  component: MigrationPage,
  beforeLoad: () => {
    if (!isFeatureEnabled('NAME_MIGRATION')) throw redirect({ to: '/' })
    if (!isConnectedToPara()) throw redirect({ to: '/' })
  },
})
