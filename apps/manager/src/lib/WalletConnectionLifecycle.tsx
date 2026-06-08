import { transactionManager } from '@ens-apps/transaction-manager'
import posthog from 'posthog-js'
import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { track } from '@/lib/posthog/events'
import { backendAuthStore } from '@/utils/backend-client'
import { setConnectedWalletCookie } from './wallet'

const handleWalletDisconnect = () => {
  void setConnectedWalletCookie(null)
  transactionManager.clearAllAndPersistence()
  backendAuthStore.trigger.signOut()
  localStorage.clear()
  track('wallet:disconnect')
  posthog.reset()
}

const handleWalletSwitch = (address: string) => {
  void setConnectedWalletCookie(address)

  const previousAuthAddress = backendAuthStore.get().context.address
  if (
    !previousAuthAddress ||
    previousAuthAddress.toLowerCase() === address.toLowerCase()
  ) {
    return
  }

  transactionManager.clearAllAndPersistence()
  backendAuthStore.trigger.signOut()
}

export const WalletConnectionLifecycle = () => {
  const { address, isConnected } = useAccount()
  const previousAddressRef = useRef<string | null>(null)

  useEffect(() => {
    const normalizedAddress = isConnected && address ? address : null
    const previousAddress = previousAddressRef.current

    if (normalizedAddress === previousAddress) {
      return
    }

    previousAddressRef.current = normalizedAddress

    if (!normalizedAddress) {
      handleWalletDisconnect()
      return
    }

    handleWalletSwitch(normalizedAddress)
  }, [address, isConnected])

  return null
}
