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
  const { address, isConnecting, isReconnecting } = useConnection()

  useEffect(() => {
    // ready && !isConnected && !address = Privy restored logged-out and wagmi
    // has no wallet → likely a stale cookie. But ExternalWalletReconnect may be
    // restoring a persisted external wallet (MetaMask) on that same stale token,
    // so don't race it: skip while wagmi is (re)connecting, and give the fallback
    // reconnect a short grace. The timer is cancelled if a connection/reconnect
    // appears (deps change) — so we only bounce once it's genuinely settled.
    if (!(ready && !isConnected && !address)) return
    if (isConnecting || isReconnecting) return
    const t = setTimeout(() => navigate({ to: '/' }), 300)
    return () => clearTimeout(t)
  }, [ready, isConnected, address, isConnecting, isReconnecting, navigate])

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
