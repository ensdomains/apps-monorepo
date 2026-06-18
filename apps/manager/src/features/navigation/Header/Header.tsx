import { useHydrated } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { DesktopHeader } from './desktop/Desktop'
import { MobileHeader } from './mobile/MobileHeader'

type HeaderProps = {
  readonly desktopBreakpoint?: 'md' | 'lg-landscape'
  readonly profileThemeColor?: string
  readonly transparentBackground?: boolean
}

export const Header = ({
  desktopBreakpoint = 'md',
  profileThemeColor,
  transparentBackground = false,
}: HeaderProps) => {
  const isDesktop = useMediaQuery(
    desktopBreakpoint === 'lg-landscape'
      ? '(min-width: 1024px) and (orientation: landscape)'
      : '(min-width: 768px)',
  )
  const isHydrated = useHydrated()
  const { isConnected, isConnecting, isReconnecting } = useConnection()

  // The connection isn't known on the server or during the connector's initial
  // reconnect. Treat it as "not settled" until then so the account/connect slot
  // renders a stable placeholder instead of flashing Connect → account (and so
  // SSR and the first client render agree).
  const connectionSettled = isHydrated && !isConnecting && !isReconnecting

  // Default to desktop until hydrated: useMediaQuery is false on the server /
  // first client render, which would flash the mobile header before hydration.
  const showMobileHeader = isHydrated && !isDesktop

  if (showMobileHeader) {
    return (
      <MobileHeader
        connectionSettled={connectionSettled}
        isConnected={isConnected}
        transparentBackground={transparentBackground}
      />
    )
  }

  return (
    <DesktopHeader
      connectionSettled={connectionSettled}
      isConnected={isConnected}
      profileThemeColor={profileThemeColor}
      transparentBackground={transparentBackground}
    />
  )
}
