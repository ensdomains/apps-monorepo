import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { DashboardLoading } from '@/features/dashboard/components/DashboardLoading'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { NotFoundPage } from '@/features/not-found/pages/NotFoundPage'
import { useSmartAccountContext } from '@/lib/smart-account'

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
})

function RouteComponent() {
  const {
    accountAddress: smartAccountAddress,
    isAccountReady,
    isLoading,
  } = useSmartAccountContext()

  if (isLoading || !isAccountReady) {
    return <DashboardLoading />
  }

  if (!smartAccountAddress) {
    return <NotFoundPage />
  }

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardPage />
    </Suspense>
  )
}
