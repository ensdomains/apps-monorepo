import { usePrivy } from '@privy-io/react-auth'
import { useHydrated } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { DesktopHeader } from './desktop/Desktop'
import { MobileHeader } from './mobile/MobileHeader'

export const Header = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isHydrated = useHydrated()
  const { isConnected, isConnecting, isReconnecting } = useConnection()
  const { ready } = usePrivy()

  // Show a loading placeholder (not "Connect") until hydrated, Privy is ready,
  // and wagmi isn't mid-(re)connect — so the slot doesn't flash "Connect" while
  // Privy restores a session and @privy-io/wagmi reconnects the wallet.
  const connectionSettled =
    isHydrated && ready && !isConnecting && !isReconnecting

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
