import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useConnection, useReadContracts } from 'wagmi'
import { PAYMENT_TOKENS } from '@/features/register/constants/paymentTokens'
import { sepoliaWithEns } from '@/lib/wagmi'
import { useFundWallet } from './useFundWallet'

const LOW_BALANCE_THRESHOLD = 500n

/**
 * Auto-funds the connected wallet when USDC+DAI balance is below threshold.
 * Matches the manager app pattern: runs when wallet is connected.
 */
export function useAutoFundOnLowBalance() {
  const { address } = useConnection()

  const {
    data: balances = [],
    isLoading: isLoadingBalances,
    refetch: refetchBalances,
  } = useReadContracts({
    contracts: PAYMENT_TOKENS.map((token) => ({
      address: token.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: address ? [address] : undefined,
      chainId: sepoliaWithEns.id,
    })),
    query: { enabled: Boolean(address) },
  })

  const fundWalletMutation = useFundWallet({
    onSuccess: (data) => {
      if (data?.txHash) {
        toast.success('Wallet funded', {
          description: 'Your wallet has been topped up with test USDC & DAI.',
          id: `fund-wallet-${address}`,
        })
        refetchBalances()
      } else {
        toast.dismiss(`fund-wallet-${address}`)
      }
    },
    onError: (error) => {
      toast.error('Failed to fund wallet', {
        description: error.message,
        id: `fund-wallet-${address}`,
      })
    },
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: Should not rerun from mutation status
  useEffect(() => {
    if (!address || isLoadingBalances || fundWalletMutation.isPending) return

    const totalBalance = balances.reduce((acc, balance, i) => {
      if (balance.status !== 'success' || balance.result === undefined)
        return acc
      const decimals = PAYMENT_TOKENS[i].decimals
      return acc + BigInt(balance.result) / BigInt(10 ** decimals)
    }, 0n)

    if (totalBalance >= LOW_BALANCE_THRESHOLD) return

    toast.loading('Funding wallet', {
      description: 'Topping up your wallet with test USDC & DAI...',
      id: `fund-wallet-${address}`,
    })
    fundWalletMutation.mutate(address)
  }, [address, isLoadingBalances, balances])
}
