import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Suspense, useEffect } from 'react'
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
  const { isLoading, hasInitialized, isConnected } = useSmartAccountContext()

  // Fallback to event listener to watch for disconnects post load.
  useParaLogoutEffect(() => {
    navigate({ to: '/' })
  })

  useEffect(() => {
    if (!hasInitialized || isLoading) return
    if (!isConnected) {
      navigate({ to: '/' })
    }
  }, [hasInitialized, isLoading, isConnected, navigate])

  if (isLoading || !hasInitialized) {
    return <DashboardLoading />
  }

  if (!isConnected) {
    return <DashboardLoading />
  }

  return (
    <div className="flex flex-1 flex-col bg-[#FCFBFB]">
      <Suspense fallback={<DashboardLoading />}>
        <DashboardPage />
      </Suspense>
    </div>
  )
}
