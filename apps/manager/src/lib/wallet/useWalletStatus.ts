import { usePrivy } from '@privy-io/react-auth'
import { useConnection } from 'wagmi'

// Wallet-layer readiness for the Header. `ready` once Privy resolves its initial
// state; `syncing` covers the Privy-authenticated-but-wagmi-not-connected-yet
// gap, so the Header shows a loading placeholder instead of flashing "Connect"
// during the handoff.
export const useWalletStatus = () => {
  const { ready, authenticated } = usePrivy()
  const { isConnected } = useConnection()
  return { ready, syncing: authenticated && !isConnected }
}
