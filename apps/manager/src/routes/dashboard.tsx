import { createFileRoute } from '@tanstack/react-router'
import { Suspense, useEffect, useState } from 'react'
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
    isLoading,
    isAccountReady,
    hasInitialized,
  } = useSmartAccountContext()

  const [showNotFound, setShowNotFound] = useState(false)
  const shouldShowNotFound =
    hasInitialized && !isLoading && (!smartAccountAddress || !isAccountReady)

  useEffect(() => {
    if (shouldShowNotFound) {
      const timer = setTimeout(() => setShowNotFound(true), 150)
      return () => clearTimeout(timer)
    }
    setShowNotFound(false)
  }, [shouldShowNotFound])

  if (!hasInitialized || isLoading || (!smartAccountAddress && !showNotFound)) {
    return <DashboardLoading />
  }

  if (showNotFound) {
    return <NotFoundPage />
  }

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardPage />
    </Suspense>
  )
}
