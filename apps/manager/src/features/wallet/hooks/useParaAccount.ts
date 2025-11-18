import { useQuery } from '@tanstack/react-query'
import { para } from '../machines/para'

export const useParaAccount = () => {
  const { data: isLoggedIn = false, isLoading: isCheckingLogin } = useQuery({
    queryKey: ['paraAccount', 'isLoggedIn'],
    queryFn: async () => {
      return await para.isFullyLoggedIn()
    },
    refetchInterval: 30000, // Reduced from 2000ms to 30 seconds
  })

  const { data: wallets = {}, isLoading: isLoadingWallets } = useQuery({
    queryKey: ['paraAccount', 'wallets'],
    queryFn: async () => {
      return para.getWallets()
    },
    enabled: isLoggedIn,
    refetchInterval: 30000, // Reduced from 5000ms to 30 seconds
  })

  // Get user profile from Para auth info
  const { data: userProfile = null, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['paraAccount', 'userProfile'],
    queryFn: async () => {
      try {
        const authInfo = para.getAuthInfo()
        if (authInfo) {
          return {
            email: (authInfo.auth as { email: string }).email || null,
            phone: (authInfo.auth as { phone: `+${number}` }).phone || null,
            name: (authInfo.auth as unknown as { name: string }).name || null,
          }
        }
        return null
      } catch (error) {
        console.error('Failed to get Para auth info:', error)
        return null
      }
    },
    enabled: isLoggedIn,
    refetchInterval: 30000,
  })

  const walletsArray = Object.values(wallets)
  const primaryWallet =
    walletsArray.find((wallet) => wallet.type === 'EVM') || walletsArray[0]

  return {
    isConnected: isLoggedIn,
    address: primaryWallet?.address,
    isLoading: isCheckingLogin || isLoadingWallets || isLoadingProfile,
    wallets: walletsArray,
    primaryWallet,
    userProfile,
  }
}
