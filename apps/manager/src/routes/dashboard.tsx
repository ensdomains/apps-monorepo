import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Suspense } from 'react'
import { DashboardLoading } from '@/features/dashboard/components/DashboardLoading'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { isConnectedToPara, useParaLogoutEffect } from '@/lib/para'
import { useSmartAccountContext } from '@/lib/smart-account'

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
  beforeLoad: () => {
    // Cookie based check for wallet connection which allows server side redirects and faster loading times
    if (!isConnectedToPara()) throw redirect({ to: '/' })
  },
})

function RouteComponent() {
  const navigate = useNavigate()
  const { isLoading, hasInitialized } = useSmartAccountContext()

  // Fallback to event listener to watch for disconnects post load.
  useParaLogoutEffect(() => {
    navigate({ to: '/' })
  })

  if (isLoading || !hasInitialized) {
    return <DashboardLoading />
  }

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardPage />
    </Suspense>
  )
}
