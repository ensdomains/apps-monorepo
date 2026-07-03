import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Suspense } from 'react'
import { DashboardLoading } from '@/features/dashboard/components/DashboardLoading'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { useOnDisconnected } from '@/features/wallet/hooks/useOnDisconnected'
import { useSmartAccountContext } from '@/lib/smart-account'

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const { isLoading, hasInitialized, isConnected } = useSmartAccountContext()

  // Client-side only so external handoffs can hydrate wallet state first.
  useOnDisconnected(() => {
    navigate({ to: '/' })
  })

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
