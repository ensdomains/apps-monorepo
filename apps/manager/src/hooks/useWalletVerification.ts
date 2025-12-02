import { useCallback, useEffect, useState } from 'react'
import { useAccount, useAccountEffect } from 'wagmi'

interface UseWalletVerificationOptions {
  enabled?: boolean
  storageKey?: string
}

export const useWalletVerification = ({
  enabled = true,
  storageKey = 'wallet_verified',
}: UseWalletVerificationOptions = {}) => {
  const { address, isConnected } = useAccount()
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [isVerified, setIsVerified] = useState(false)

  const getStorageKey = useCallback(
    (addr: `0x${string}`) => `${storageKey}_${addr}`,
    [storageKey],
  )

  const handleVerificationComplete = useCallback(() => {
    if (address && typeof window !== 'undefined') {
      localStorage.setItem(getStorageKey(address), 'true')
      setIsVerified(true)
    }
    setShowVerifyModal(false)
  }, [address, getStorageKey])

  const resetVerification = useCallback(() => {
    if (address && typeof window !== 'undefined') {
      localStorage.removeItem(getStorageKey(address))
    }
    setIsVerified(false)
  }, [address, getStorageKey])

  useAccountEffect({
    onConnect({ address: connectedAddress }) {
      if (enabled && connectedAddress && typeof window !== 'undefined') {
        const verified = localStorage.getItem(getStorageKey(connectedAddress))
        if (verified !== 'true') {
          setTimeout(() => {
            setShowVerifyModal(true)
          }, 500)
        } else {
          setIsVerified(true)
        }
      }
    },
    onDisconnect() {
      setIsVerified(false)
    },
  })

  useEffect(() => {
    if (enabled && isConnected && address && typeof window !== 'undefined') {
      const verified = localStorage.getItem(getStorageKey(address))
      if (verified !== 'true') {
        setTimeout(() => {
          setShowVerifyModal(true)
        }, 500)
      } else {
        setIsVerified(true)
      }
    }
  }, [enabled, isConnected, address, getStorageKey])

  return {
    showVerifyModal,
    setShowVerifyModal,
    handleVerificationComplete,
    resetVerification,
    isVerified,
  }
}
