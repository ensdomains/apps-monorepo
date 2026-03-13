import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { useEffect } from 'react'
import type { Address } from 'viem'
import { useConnection, useReadContracts } from 'wagmi'
import {
  DAI_DECIMALS,
  SUPPORTED_TOKENS,
  USDC_DECIMALS,
} from '@/lib/constants/tokens'
import { sepoliaWithEns } from '@/lib/wagmi'
import { useFundWallet } from './useFundWallet'

const PAYMENT_TOKENS = [
  { address: SUPPORTED_TOKENS.USDC, decimals: USDC_DECIMALS },
  { address: SUPPORTED_TOKENS.DAI, decimals: DAI_DECIMALS },
] as const

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
        refetchBalances()
      }
    },
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: Should not rerun from mutation status
  useEffect(() => {
    if (!address || isLoadingBalances || !fundWalletMutation.isIdle) return

    const totalBalance = balances.reduce((acc, balance, i) => {
      if (balance.status !== 'success' || balance.result === undefined)
        return acc
      const decimals = PAYMENT_TOKENS[i].decimals
      return acc + BigInt(balance.result) / BigInt(10 ** decimals)
    }, 0n)

    if (totalBalance >= LOW_BALANCE_THRESHOLD) return

    fundWalletMutation.mutate(address as Address)
  }, [address, isLoadingBalances, balances])
}
