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

/**
 * Stale-session escape hatch. The `beforeLoad` cookie guard admits us whenever
 * a `privy-token` cookie is present — but that token can be stale. If Privy
 * finishes restoring (`ready`) in a logged-out state AND no external wallet is
 * connected, the smart account never initialises, so `RouteComponent` would sit
 * on `DashboardLoading` forever (and `useOnDisconnected` stays quiet because the
 * cookie still exists). Bounce back to the landing page in that case.
 *
 * Rendered only when Privy is configured (mirrors RootProviders), and always
 * mounted — independent of the loading branches below — so it can fire while
 * the dashboard is still in its loading state.
 */
function PrivyStaleSessionGuard() {
  const navigate = useNavigate()
  const { ready, isConnected } = usePrivySession()
  const { address } = useConnection()

  useEffect(() => {
    // `ready && !isConnected` = Privy tried to restore and the user is logged
    // out. With no external wallet (`!address`) either, the cookie was stale.
    // (During the legitimate reload gap Privy is authenticated but `address`
    // hasn't surfaced yet — that's not this case, so we don't bounce it.)
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
