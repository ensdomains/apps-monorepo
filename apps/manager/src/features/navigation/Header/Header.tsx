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

  // `useMediaQuery` can't read the viewport on the server (no `matchMedia`),
  // so it returns `false` on SSR and the first client render — which would
  // render the mobile header and flash to desktop after hydration. Default to
  // the desktop layout until mounted so SSR and the first client render agree
  // (no hydration mismatch) and desktop users never see the mobile flash; a
  // real mobile device switches to the mobile header once mounted.
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
