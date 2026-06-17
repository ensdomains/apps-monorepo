import { useCallback } from 'react'
import { useDisconnect } from 'wagmi'

// Sign-out. When the vendor changes, swap the body (e.g. Privy logout + wagmi
// disconnect) — call sites keep calling this.
export const useWalletDisconnect = () => {
  const { mutateAsync } = useDisconnect()
  return useCallback(async () => {
    await mutateAsync().catch(() => {})
  }, [mutateAsync])
}
