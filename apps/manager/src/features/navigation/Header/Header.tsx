import { useConnection } from 'wagmi'
import { useHasMounted } from '@/hooks/useHasMounted'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { DesktopHeader } from './desktop/Desktop'
import { MobileHeader } from './mobile/MobileHeader'

export const Header = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const hasMounted = useHasMounted()
  const { isConnected, isConnecting, isReconnecting } = useConnection()

  // The connection isn't known on the server or during the connector's initial
  // reconnect. Treat it as "not settled" until then so the account/connect slot
  // renders a stable placeholder instead of flashing Connect → account (and so
  // SSR and the first client render agree — see useHasMounted).
  const connectionSettled = hasMounted && !isConnecting && !isReconnecting

  // Default to desktop until mounted: useMediaQuery is false on the server /
  // first client render, which would flash the mobile header before hydration.
  const showMobileHeader = hasMounted && !isDesktop

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
