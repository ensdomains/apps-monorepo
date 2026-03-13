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
import { useFundWallet } from '@/lib/wallet/useFundWallet'

const PAYMENT_TOKENS = [
  { address: SUPPORTED_TOKENS.USDC, decimals: USDC_DECIMALS },
  { address: SUPPORTED_TOKENS.DAI, decimals: DAI_DECIMALS },
] as const

/**
 * Auto-funds the connected wallet with USDC and DAI on Sepolia when balance is low.
 * Matches the manager app pattern: runs globally when wallet is connected.
 */
export function AutoFundWallet() {
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

  // Auto-fund if balance is low (matches manager: totalBalance < 500 whole units)
  useEffect(() => {
    if (!address || isLoadingBalances || !fundWalletMutation.isIdle) return

    const totalBalance = balances.reduce((acc, balance, i) => {
      if (balance.status !== 'success' || balance.result === undefined)
        return acc
      const decimals = PAYMENT_TOKENS[i].decimals
      return acc + BigInt(balance.result) / BigInt(10 ** decimals)
    }, 0n)

    if (totalBalance >= 500n) return

    fundWalletMutation.mutate(address as Address)
  }, [
    address,
    isLoadingBalances,
    balances,
    fundWalletMutation.isIdle,
    fundWalletMutation.mutate,
  ])

  return null
}
