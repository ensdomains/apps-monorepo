import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Suspense, useEffect } from 'react'
import { DashboardLoading } from '@/features/dashboard/components/DashboardLoading'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { useSmartAccountContext } from '@/lib/smart-account'

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const {
    accountAddress: smartAccountAddress,
    isLoading,
    isAccountReady,
    hasInitialized,
  } = useSmartAccountContext()

  const shouldRedirect =
    hasInitialized && !isLoading && (!smartAccountAddress || !isAccountReady)

  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: '/' })
    }
  }, [shouldRedirect, navigate])

  if (!hasInitialized || isLoading || shouldRedirect) {
    return <DashboardLoading />
  }

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardPage />
    </Suspense>
  )
}
