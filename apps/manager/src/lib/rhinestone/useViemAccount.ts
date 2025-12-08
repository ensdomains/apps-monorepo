// hooks/useViemAccount.ts
/** This hook is used to create a viem account from a para client, since we aren't
 * using the full react-sdk library, we need to create a viem account manually
 **/
import { useClient } from '@getpara/react-sdk-lite'
import { createParaAccount } from '@getpara/viem-v2-integration'
import { useMemo } from 'react'
import { createWalletClient, custom } from 'viem'
import { sepolia } from 'viem/chains'

export function useViemAccount() {
  const paraClient = useClient()

  const viemAccount = useMemo(() => {
    if (!paraClient) return null

    try {
      // Create Para account adapter for viem
      const account = createParaAccount(paraClient as any)

      return account
    } catch (error) {
      console.error('Failed to create viem account:', error)
      return null
    }
  }, [paraClient])

  const walletClient = useMemo(() => {
    if (!viemAccount) return null

    return createWalletClient({
      account: viemAccount,
      chain: sepolia,
      transport: custom({
        request: async ({ message }) => {
          // Para client handles the requests through the account
          return await viemAccount.signMessage({ message })
        },
      }),
    })
  }, [viemAccount])

  return {
    viemAccount,
    walletClient,
    isLoading: !paraClient,
    address: viemAccount?.address,
  }
}
