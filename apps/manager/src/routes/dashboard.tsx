import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Suspense } from 'react'
import { DashboardLoading } from '@/features/dashboard/components/DashboardLoading'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { useOnDisconnected } from '@/features/wallet/hooks/useOnDisconnected'
import { useSmartAccountContext } from '@/lib/smart-account'
import { isWalletConnected } from '@/lib/wallet'

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
  beforeLoad: () => {
    // Cookie based check for wallet connection which allows server side redirects and faster loading times
    if (!isWalletConnected()) throw redirect({ to: '/' })
  },
})

function RouteComponent() {
  const navigate = useNavigate()
  const { isLoading, hasInitialized, isConnected } = useSmartAccountContext()

  // Fallback to event listener to watch for disconnects post load.
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
