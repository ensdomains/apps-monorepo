import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { useDisconnect } from 'wagmi'
import { useWalletUi } from './wallet-context'

/**
 * Canonical sign-out. Clears the vendor session first (Privy logout, or nothing
 * for an external wallet) so its tokens are gone before the wagmi disconnect
 * fires the onDisconnect cleanup (WalletLifecycle: backend auth + transactions +
 * analytics), then returns to the landing page.
 */
export const useSignOut = () => {
  const navigate = useNavigate()
  const { clearSession, isClearingSession } = useWalletUi()
  const { mutateAsync: disconnectAsync, isPending: isDisconnecting } =
    useDisconnect()

  const signOut = useCallback(async () => {
    await clearSession()
    await disconnectAsync().catch(() => {})
    navigate({ to: '/' })
  }, [clearSession, disconnectAsync, navigate])

  return { signOut, isSigningOut: isClearingSession || isDisconnecting }
}
