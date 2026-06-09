import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Suspense, useEffect } from 'react'
import { useConnection } from 'wagmi'
import { DashboardLoading } from '@/features/dashboard/components/DashboardLoading'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { useOnDisconnected } from '@/features/wallet/hooks/useOnDisconnected'
import { isWalletConnectedCookie } from '@/lib/connection-cookie'
import { hasPrivySessionCookie } from '@/lib/privy/has-privy-session'
import { usePrivySession } from '@/lib/privy/usePrivySession'
import { useSmartAccountContext } from '@/lib/smart-account'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID ?? ''

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
  beforeLoad: () => {
    // Cookie-based guard (server-side redirect / fast load). Either signal lets
    // us in: the wallet-address cookie OR the Privy session cookie (server-
    // readable, survives the reload window while the connector reconnects).
    if (!isWalletConnectedCookie() && !hasPrivySessionCookie()) {
      throw redirect({ to: '/' })
    }
  },
})

/**
 * Stale-session escape hatch. beforeLoad admits us on a `privy-token` cookie,
 * but it can be stale: if Privy restores logged-out with no external wallet, the
 * dashboard would hang on DashboardLoading forever. Always mounted (so it fires
 * during loading); rendered only when Privy is configured.
 */
function PrivyStaleSessionGuard() {
  const navigate = useNavigate()
  const { ready, isConnected } = usePrivySession()
  const { address } = useConnection()

  useEffect(() => {
    // ready && !isConnected && !address = Privy restored logged-out and no
    // external wallet → the cookie was stale, bounce home. (The reload gap is
    // authenticated-but-address-not-yet-surfaced, which this correctly ignores.)
    if (ready && !isConnected && !address) {
      navigate({ to: '/' })
    }
  }, [ready, isConnected, address, navigate])

  return null
}

function RouteComponent() {
  const navigate = useNavigate()
  const { isLoading, hasInitialized, isConnected } = useSmartAccountContext()

  // Fallback to event listener to watch for disconnects post load.
  useOnDisconnected(() => {
    navigate({ to: '/' })
  })

  const body =
    isLoading || !hasInitialized || !isConnected ? (
      <DashboardLoading />
    ) : (
      <div className="flex flex-1 flex-col bg-[#FCFBFB]">
        <Suspense fallback={<DashboardLoading />}>
          <DashboardPage />
        </Suspense>
      </div>
    )

  return (
    <>
      {privyAppId ? <PrivyStaleSessionGuard /> : null}
      {body}
    </>
  )
}
