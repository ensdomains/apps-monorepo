import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import { useConnection } from 'wagmi'

// How long to treat the Privy→wagmi handoff as "syncing" before giving up. A
// stalled handoff (embedded-wallet creation error, cancelled prompt, connector
// stall) must not pin the Header on a loading placeholder forever — after this
// we release `syncing` so the connect button reappears and the user can retry.
const HANDOFF_TIMEOUT_MS = 10_000

// Wallet-layer readiness for the Header. `ready` once Privy resolves its initial
// state; `syncing` covers the Privy-authenticated-but-wagmi-not-connected-yet
// gap, so the Header shows a loading placeholder instead of flashing "Connect"
// during the handoff — bounded by HANDOFF_TIMEOUT_MS so a stall is recoverable.
export const useWalletStatus = () => {
  const { ready, authenticated } = usePrivy()
  const { isConnected } = useConnection()
  const handingOff = authenticated && !isConnected
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!handingOff) {
      setTimedOut(false)
      return
    }
    const id = setTimeout(() => setTimedOut(true), HANDOFF_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [handingOff])

  return { ready, syncing: handingOff && !timedOut }
}
