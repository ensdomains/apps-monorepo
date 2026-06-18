import { useHydrated } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { DesktopHeader } from './desktop/Desktop'
import { MobileHeader } from './mobile/MobileHeader'

export const Header = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isHydrated = useHydrated()
  const { isConnected, isConnecting, isReconnecting } = useConnection()

  // Show a loading placeholder (not "Connect") until hydrated and nothing is
  // mid-connect, so the slot doesn't flash during reconnection.
  const connectionSettled = isHydrated && !isConnecting && !isReconnecting

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
