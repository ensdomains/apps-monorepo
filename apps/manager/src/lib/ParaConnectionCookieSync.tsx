import { useWallet } from '@getpara/react-sdk-lite'
import { useEffect, useRef } from 'react'
import { setParaConnectionCookie } from './para'

export const ParaConnectionCookieSync = () => {
  const { data: wallet, isPending } = useWallet()
  const previousAddressRef = useRef<string | null>(null)

  useEffect(() => {
    if (isPending) return

    const address = wallet?.address ?? null

    if (address === previousAddressRef.current) return

    previousAddressRef.current = address
    void setParaConnectionCookie(address)
  }, [isPending, wallet?.address])

  return null
}
