import { createFileRoute } from '@tanstack/react-router'
import { MigrationPage } from '@/features/migration/pages/MigrationPage'

export const Route = createFileRoute('/migration')({
  component: MigrationPage,
})
