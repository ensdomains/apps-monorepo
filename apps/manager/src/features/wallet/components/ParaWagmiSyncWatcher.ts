import { useLogout, useModal, useWallet } from '@getpara/react-sdk-lite'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useWalletClient } from 'wagmi'

/**
 * ParaWagmiSyncWatcher
 *
 * Empty component that watches the connection state between the Para SDK wallet and the client's wallet connection.
 * If the application thinks the user is connected but cannot access the wallet client, show a global error
 * toast requesting the user to reconnect. Offers a reconnect action that logs out and re-opens the connect modal.
 */
export const ParaWagmiSyncWatcher = (): undefined => {
  const wallet = useWallet()
  const isConnected = !!wallet.data && !wallet.isLoading
  const walletClient = useWalletClient()
  const hasWalletClient = walletClient.status === 'success'

  const logout = useLogout()
  const { openModal } = useModal()

  // biome-ignore lint/correctness/useExhaustiveDependencies: Not part of the required deps
  useEffect(() => {
    if (isConnected && !hasWalletClient) {
      toast.error('Wallet connector out of sync', {
        description: 'Please reconnect your wallet and try again',
        dismissible: false,
        id: 'wallet-connector-out-of-sync',
        action: {
          label: 'Reconnect',
          onClick: async () => {
            await logout.logoutAsync()
            openModal()
          },
        },
        duration: Infinity,
      })
    } else {
      toast.dismiss('wallet-connector-out-of-sync')
    }
  }, [isConnected, hasWalletClient])
}
