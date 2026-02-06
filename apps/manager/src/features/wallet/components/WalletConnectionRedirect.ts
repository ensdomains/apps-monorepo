import { useWallet } from '@getpara/react-sdk-lite'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

/**
 * WalletConnectionRedirect
 *
 * Watches for wallet connection state changes and redirects to dashboard
 * when a wallet becomes connected. Only triggers once per connection event.
 */
export const WalletConnectionRedirect = (): undefined => {
  const { data: wallet, isLoading } = useWallet()
  const navigate = useNavigate()
  const wasConnectedRef = useRef<boolean | null>(null)

  useEffect(() => {
    // Wait for initial loading to complete
    if (isLoading) return

    const isConnected = !!wallet

    // On first check, just record the state without redirecting
    if (wasConnectedRef.current === null) {
      wasConnectedRef.current = isConnected
      return
    }

    // Redirect to dashboard when transitioning from disconnected to connected
    if (!wasConnectedRef.current && isConnected) {
      navigate({ to: '/dashboard' })
    }

    wasConnectedRef.current = isConnected
  }, [wallet, isLoading, navigate])
}
