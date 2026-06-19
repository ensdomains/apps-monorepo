import { usePrivy } from '@privy-io/react-auth'
import { useRef } from 'react'
import { useReconnect } from 'wagmi'
import { useWalletStatus } from './useWalletStatus'

// The app's connect entry point. Returns `openConnectModal` (undefined until
// Privy is ready, which gates the connect buttons) so call sites stay agnostic
// to the wallet vendor. `login()` itself opens a singleton modal whose backdrop
// blocks further clicks, so it needs no re-entry guard; the async recovery path
// below does.
export const useConnectModal = () => {
  const { ready, authenticated, login, logout } = usePrivy()
  const { reconnect } = useReconnect()
  const { syncing } = useWalletStatus()
  const recovering = useRef(false)

  const openConnectModal = ready
    ? () => {
        if (authenticated) {
          // Mid-handoff: retry the wagmi connection from the live Privy
          // session. Once the handoff has timed out (`syncing` released), the
          // session exists but wagmi never connected — a reconnect would hit
          // the same stall, so log out and start a fresh login. `logout()` is
          // async, so guard against a double-click spawning two chains.
          if (syncing) {
            reconnect()
            return
          }
          if (recovering.current) return
          recovering.current = true
          logout()
            .catch(() => {})
            .finally(() => {
              recovering.current = false
              login()
            })
          return
        }
        login()
      }
    : undefined

  return { openConnectModal }
}
