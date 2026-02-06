import { useWallet } from '@getpara/react-sdk-lite'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

/**
 * WalletConnectionRedirect
 *
 * Watches for wallet connection state changes and redirects to dashboard
 * when a wallet becomes connected on the home page. Only triggers once per
 * connection event and only when the user is on the landing page.
 */
export const WalletConnectionRedirect = (): undefined => {
  const { data: wallet, isLoading } = useWallet()
  const navigate = useNavigate()
  const location = useLocation()
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

    // Only redirect to dashboard when:
    // 1. Transitioning from disconnected to connected
    // 2. User is on the home page (landing page)
    if (!wasConnectedRef.current && isConnected && location.pathname === '/') {
      navigate({ to: '/dashboard' })
    }

    wasConnectedRef.current = isConnected
  }, [wallet, isLoading, navigate, location.pathname])
}
