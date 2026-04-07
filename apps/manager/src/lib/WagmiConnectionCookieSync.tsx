import { transactionManager } from '@ens-apps/transaction-manager'
import { useWallet } from '@getpara/react-sdk-lite'
import { useConnectionEffect } from 'wagmi'
import { backendAuthStore } from '@/utils/backend-client'
import { useDirectMetaMask } from './DirectMetaMaskContext'
import { setParaConnectionCookie } from './para'

export const WagmiConnectionCookieSync = () => {
  const { data: paraWallet } = useWallet()
  const directMetaMask = useDirectMetaMask()

  useConnectionEffect({
    onConnect({ address }) {
      if (
        directMetaMask.isConnected ||
        directMetaMask.isConnecting ||
        directMetaMask.isActive
      )
        return
      if (paraWallet && !paraWallet.isExternal) return
      void setParaConnectionCookie(address)
    },
    onDisconnect() {
      if (
        directMetaMask.isConnected ||
        directMetaMask.isConnecting ||
        directMetaMask.isActive
      )
        return
      if (paraWallet && !paraWallet.isExternal) return
      void setParaConnectionCookie(null)
      transactionManager.clearAllAndPersistence()
      backendAuthStore.trigger.signOut()
    },
  })

  return null
}
