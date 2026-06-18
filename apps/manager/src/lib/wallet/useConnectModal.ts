import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import { useReconnect } from 'wagmi'

// Opens Privy's hosted login. If already authenticated, reconnect wagmi instead
// (recovery flows shouldn't be a no-op). `connectModalOpen` guards against a
// double-trigger; Privy emits no modal-close event, so it self-clears after a
// beat in case the user dismisses without logging in.
export const useConnectModal = () => {
  const { ready, authenticated, login } = usePrivy()
  const { reconnect } = useReconnect()
  const [connectModalOpen, setConnectModalOpen] = useState(false)

  useEffect(() => {
    if (authenticated) setConnectModalOpen(false)
  }, [authenticated])

  const openConnectModal = ready
    ? () => {
        if (authenticated) {
          reconnect()
          return
        }
        if (connectModalOpen) return
        setConnectModalOpen(true)
        login()
        setTimeout(() => setConnectModalOpen(false), 2000)
      }
    : undefined

  return { openConnectModal, connectModalOpen }
}
