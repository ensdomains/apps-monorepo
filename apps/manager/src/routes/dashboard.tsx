import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Suspense } from 'react'
import { DashboardLoading } from '@/features/dashboard/components/DashboardLoading'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { useOnDisconnected } from '@/features/wallet/hooks/useOnDisconnected'
import { isWalletConnectedCookie } from '@/lib/connection-cookie'
import { hasPrivySessionCookie } from '@/lib/privy/has-privy-session'
import { useSmartAccountContext } from '@/lib/smart-account'

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
  beforeLoad: () => {
    // Cookie-based guard for server-side redirects / faster loads. Allow access
    // for either signal: the wallet-address cookie (external wallets) OR a Privy
    // session cookie. The Privy check is server-readable (works even with
    // HttpOnly cookies on) and survives the reload window where the wallet
    // cookie is briefly out of sync while the Privy connector reconnects.
    if (!isWalletConnectedCookie() && !hasPrivySessionCookie()) {
      throw redirect({ to: '/' })
    }
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
