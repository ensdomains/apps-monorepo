import { usePrivy } from '@privy-io/react-auth'
import { useReconnect } from 'wagmi'
import { useWalletStatus } from './useWalletStatus'

// The app's connect entry point. Returns `openConnectModal` (undefined until
// Privy is ready, which gates the connect buttons) so call sites stay agnostic
// to the wallet vendor.
export const useConnectModal = () => {
  const { ready, authenticated, login, logout } = usePrivy()
  const { reconnect } = useReconnect()
  const { syncing } = useWalletStatus()

  const openConnectModal = ready
    ? () => {
        if (authenticated) {
          // Mid-handoff: retry the wagmi connection from the live Privy
          // session. Once the handoff has timed out (`syncing` released), the
          // session exists but wagmi never connected — a reconnect would hit
          // the same stall, so start a fresh login instead.
          if (syncing) reconnect()
          else
            logout()
              .catch(() => {})
              .finally(login)
          return
        }
        login()
      }
    : undefined

  return { openConnectModal }
}
