import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'

function RouteComponent() {
  return <DashboardPage />
}

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
})
