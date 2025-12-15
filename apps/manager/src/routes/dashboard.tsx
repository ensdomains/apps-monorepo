import { useWallet } from '@getpara/react-sdk-lite'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { DashboardLoading } from '@/features/dashboard/components/DashboardLoading'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { NotFoundPage } from '@/features/not-found/pages/NotFoundPage'

function RouteComponent() {
  const { data: wallet, isLoading } = useWallet()

  if (isLoading) {
    return <DashboardLoading />
  }

  if (!wallet) {
    return <NotFoundPage />
  }

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardPage />
    </Suspense>
  )
}

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
})
