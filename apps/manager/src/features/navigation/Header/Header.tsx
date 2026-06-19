import { useHydrated } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useConnectModal } from '@/lib/wallet'
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
  // Wallet-layer readiness (keeps the Privy SDK out of this component).
  const { isReady } = useConnectModal()

  // Show a loading placeholder (not "Connect") until hydrated, the wallet layer
  // is ready, and wagmi isn't mid-(re)connect — so the slot doesn't flash
  // "Connect" while Privy restores a session and @privy-io/wagmi reconnects.
  const connectionSettled =
    isHydrated && isReady && !isConnecting && !isReconnecting

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
