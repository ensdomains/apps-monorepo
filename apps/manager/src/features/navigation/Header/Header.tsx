import { useHydrated } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  hasStoredPrivySession,
  isPrivyOAuthRedirect,
} from '@/lib/privy/has-privy-session'
import { usePrivySession } from '@/lib/privy/usePrivySession'
import { DesktopHeader } from './desktop/Desktop'
import { MobileHeader } from './mobile/MobileHeader'

export const Header = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isHydrated = useHydrated()
  const { isConnected, isConnecting, isReconnecting } = useConnection()
  const { ready: privyReady, isConnected: privyAuthed } = usePrivySession()

  // Privy is mid-connect when it's authenticated but wagmi hasn't caught up yet
  // (the bridge handoff), the SDK is still restoring a stored session, or we
  // just returned from an OAuth redirect. wagmi reports none of these as
  // "connecting", so without this the slot would show "Connect" during the gap.
  const privyConnecting =
    (privyAuthed && !isConnected) ||
    (hasStoredPrivySession() && !privyReady) ||
    isPrivyOAuthRedirect()

  // The connection isn't known on the server or while it's still settling.
  // Treat it as "not settled" until then so the account/connect slot renders a
  // stable loading placeholder instead of flashing (or sticking on) Connect.
  const connectionSettled =
    isHydrated && !isConnecting && !isReconnecting && !privyConnecting

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
