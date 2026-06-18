import { useHydrated } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useWalletStatus } from '@/lib/wallet'
import { DesktopHeader } from './desktop/Desktop'
import { MobileHeader } from './mobile/MobileHeader'

export const Header = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isHydrated = useHydrated()
  const { isConnected, isConnecting, isReconnecting } = useConnection()
  const { ready, syncing } = useWalletStatus()

  // Show a loading placeholder (not "Connect") until hydrated, Privy is ready,
  // and nothing is mid-connect — so the slot doesn't flash "Connect" during the
  // Privy→wagmi handoff or reconnection.
  const connectionSettled =
    isHydrated && ready && !isConnecting && !isReconnecting && !syncing

  // Default to desktop until hydrated: useMediaQuery is false on the server /
  // first client render, which would flash the mobile header before hydration.
  const showMobileHeader = isHydrated && !isDesktop

  if (showMobileHeader) {
    return (
      <MobileHeader
        connectionSettled={connectionSettled}
        isConnected={isConnected}
      />
    )
  }

  return (
    <DesktopHeader
      connectionSettled={connectionSettled}
      isConnected={isConnected}
    />
  )
}
