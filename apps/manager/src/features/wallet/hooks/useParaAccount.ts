import { useQuery } from '@tanstack/react-query'
import { para } from '../machines/para'

export const useParaAccount = () => {
  const { data: isLoggedIn = false, isLoading: isCheckingLogin } = useQuery({
    queryKey: ['paraAccount', 'isLoggedIn'],
    queryFn: async () => {
      return await para.isFullyLoggedIn()
    },
    refetchInterval: 2000,
  })

  const { data: wallets = {}, isLoading: isLoadingWallets } = useQuery({
    queryKey: ['paraAccount', 'wallets'],
    queryFn: async () => {
      return para.getWallets()
    },
    enabled: isLoggedIn,
    refetchInterval: 5000,
  })

  const walletsArray = Object.values(wallets)
  const primaryWallet =
    walletsArray.find((wallet) => wallet.type === 'EVM') || walletsArray[0]

  return {
    isConnected: isLoggedIn,
    address: primaryWallet?.address,
    isLoading: isCheckingLogin || isLoadingWallets,
    wallets: walletsArray,
    primaryWallet,
  }
}
