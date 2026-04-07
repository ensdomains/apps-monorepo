import { useWallet } from '@getpara/react-sdk-lite'
import { useEffect, useRef } from 'react'
import { useDirectMetaMask } from './DirectMetaMaskContext'
import { setParaConnectionCookie } from './para'

export const ParaConnectionCookieSync = () => {
  const { data: wallet, isPending } = useWallet()
  const directMetaMask = useDirectMetaMask()
  const previousAddressRef = useRef<string | null>(null)

  useEffect(() => {
    if (isPending) return
    if (directMetaMask.isActive || directMetaMask.isConnecting) return

    const address = wallet?.address ?? null

    if (address === previousAddressRef.current) return

    previousAddressRef.current = address
    void setParaConnectionCookie(address)
  }, [
    directMetaMask.isActive,
    directMetaMask.isConnecting,
    isPending,
    wallet?.address,
  ])

  return null
}
