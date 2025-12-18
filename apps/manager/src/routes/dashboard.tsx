import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { DashboardLoading } from '@/features/dashboard/components/DashboardLoading'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'

// TODO: Fix redirect logic for Para wallets
// import { useRef } from 'react'
// import { useSmartAccountContext } from '@/lib/smart-account'

// let isSpaNavigation = false

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
  // beforeLoad: () => {
  //   // Marks that we arrived here via SPA navigation (Link click)
  //   // This does NOT run on manual URL entry or page refresh, this is hacky way to detect SPA navigation
  //   isSpaNavigation = true
  // },
})

function RouteComponent() {
  // TODO: Fix redirect logic for Para wallets
  // const {
  //   accountAddress: smartAccountAddress,
  //   isLoading,
  //   isAccountReady,
  //   hasInitialized,
  //   hasWalletInStorage,
  // } = useSmartAccountContext()

  // const wasSpaNavigation = useRef(isSpaNavigation)
  // const isFullPageLoad = !wasSpaNavigation.current

  // // Track if wallet was ever ready (to detect disconnect)
  // const wasEverReady = useRef(false)
  // if (isAccountReady && smartAccountAddress) {
  //   wasEverReady.current = true
  // }

  // // Full page load without wallet: redirect immediately
  // useEffect(() => {
  //   if (isFullPageLoad && !hasWalletInStorage) {
  //     navigate({ to: '/' })
  //   }
  // }, [isFullPageLoad, hasWalletInStorage, navigate])

  // const isWalletFullyReady = isFullPageLoad
  //   ? hasInitialized && !isLoading && isAccountReady
  //   : hasInitialized

  // const didDisconnect =
  //   wasEverReady.current && hasInitialized && !smartAccountAddress

  // const shouldRedirect =
  //   (isWalletFullyReady && !smartAccountAddress) || didDisconnect

  // useEffect(() => {
  //   if (shouldRedirect) {
  //     navigate({ to: '/' })
  //   }
  // }, [shouldRedirect, navigate])

  // if (!isWalletFullyReady && !shouldRedirect) {
  //   return <DashboardLoading />
  // }

  // if (shouldRedirect) {
  //   return <DashboardLoading />
  // }

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardPage />
    </Suspense>
  )
}
