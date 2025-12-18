import { createFileRoute useNavigate } from '@tanstack/react-router'
import { Suspense useEffect, useRef } from 'react'
import { DashboardLoading } from '@/features/dashboard/components/DashboardLoading'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'

import { useSmartAccountContext } from '@/lib/smart-account'

let isSpaNavigation = false

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
  beforeLoad: () => {
    // Marks that we arrived here via SPA navigation (Link click)
    // This does NOT run on manual URL entry or page refresh,
    // im doing this because I still want rediect with no loading when user clicks on a link
    isSpaNavigation = true
  },
})

function RouteComponent() {
  const navigate = useNavigate()
  const {
    accountAddress: smartAccountAddress,
    isLoading,
    isAccountReady,
    hasInitialized,
    hasWalletInStorage,
  } = useSmartAccountContext()

  const wasSpaNavigation = useRef(isSpaNavigation)
  const isFullPageLoad = !wasSpaNavigation.current

  // Track if wallet was ever ready (to detect disconnect)
  const wasEverReady = useRef(false)
  if (isAccountReady && smartAccountAddress) {
    wasEverReady.current = true
  }

  // Full page load without wallet: redirect immediately
  useEffect(() => {
    if (isFullPageLoad && !hasWalletInStorage) {
      navigate({ to: '/' })
    }
  }, [isFullPageLoad, hasWalletInStorage, navigate])

  const isWalletFullyReady = isFullPageLoad
    ? hasInitialized && !isLoading && isAccountReady
    : hasInitialized

  const didDisconnect =
    wasEverReady.current && hasInitialized && !smartAccountAddress

  const shouldRedirect =
    (isWalletFullyReady && !smartAccountAddress) || didDisconnect

  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: '/' })
    }
  }, [shouldRedirect, navigate])

  if (!isWalletFullyReady && !shouldRedirect) {
    return <DashboardLoading />
  }

  if (shouldRedirect) {
    return <DashboardLoading />
  }

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardPage />
    </Suspense>
  )
}
