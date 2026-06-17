import { useHydrated } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useWalletUi } from '@/lib/wallet'
import { DesktopHeader } from './desktop/Desktop'
import { MobileHeader } from './mobile/MobileHeader'

export const Header = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isHydrated = useHydrated()
  const { isConnected, isConnecting, isReconnecting } = useConnection()
  // Vendor-agnostic wallet state (RainbowKit or Privy fills it): `ready` = the
  // wallet layer resolved its initial state; `syncing` = an in-flight connect
  // beyond wagmi's flags (e.g. the Privy→wagmi gap).
  const { ready, syncing } = useWalletUi()

  // Key "connected" off WAGMI (the account display reads the address from wagmi).
  // Not settled until hydrated, the wallet layer is ready, and nothing is mid-
  // connect — so the slot shows a loading placeholder instead of flashing
  // "Connect" during a handoff.
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
