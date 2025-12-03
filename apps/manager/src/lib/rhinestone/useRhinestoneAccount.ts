'use client'

import { type RhinestoneAccount, RhinestoneSDK } from '@rhinestone/sdk'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { type Address, createPublicClient, formatUnits, http } from 'viem'
import { sepolia } from 'viem/chains'
import { useConnection, useWalletClient } from 'wagmi'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'
import { ERC20_ABI } from '../ens.abi'
import { walletClientToAccount, wrapParaAccount } from './rhinestone-utils'
import { getTxHashResult } from './utils'

const SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'

export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: {
      http: [SEPOLIA_RPC_URL],
    },
    public: {
      http: [SEPOLIA_RPC_URL],
    },
  },
}
const publicClient = createPublicClient({
  chain: customSepolia,
  transport: http(SEPOLIA_RPC_URL),
})

export interface RhinestoneAccountState {
  rhinestoneAccount: RhinestoneAccount | null
  accountAddress: string | null
  isLoading: boolean
  error: string | null
  rhinestoneConfig: any | null
  isAutoFunding: boolean
  autoFundingError: string | null
}

export function useRhinestoneAccount() {
  const account = useConnection()
  const { data: walletClient } = useWalletClient()
  const queryClient = useQueryClient()

  const [state, setState] = useState<RhinestoneAccountState>({
    rhinestoneAccount: null,
    accountAddress: null,
    isLoading: false,
    error: null,
    rhinestoneConfig: null,
    isAutoFunding: false,
    autoFundingError: null,
  })

  const { data: eoaEthBalance, isLoading: isLoadingEoaEth } = useQuery({
    queryKey: ['eoaEthBalance', account.address],
    queryFn: async () => {
      if (!account.address) return null
      try {
        const balance = await publicClient.getBalance({
          address: account.address as Address,
        })
        return {
          balance: balance.toString(),
          formattedBalance: `${parseFloat(formatUnits(balance, 18)).toFixed(4)} ETH`,
        }
      } catch (_error) {
        return null
      }
    },
    enabled: account.isConnected && !!account.address,
    refetchInterval: 30000,
    retry: 1,
    retryDelay: 5000,
  })

  const { data: smartAccountEthBalance, isLoading: isLoadingSmartAccountEth } =
    useQuery({
      queryKey: ['smartAccountEthBalance', state.accountAddress],
      queryFn: async () => {
        if (!state.accountAddress) return null
        try {
          const balance = await publicClient.getBalance({
            address: state.accountAddress as Address,
          })
          return {
            balance: balance.toString(),
            formattedBalance: `${parseFloat(formatUnits(balance, 18)).toFixed(4)} ETH`,
          }
        } catch (_error) {
          return null
        }
      },
      enabled: account.isConnected && !!state.accountAddress,
      refetchInterval: 30000,
      retry: 1,
      retryDelay: 5000,
    })

  const { data: stablecoinBalances = [], isLoading: isLoadingBalances } =
    useQuery({
      queryKey: ['stablecoinBalances', state.accountAddress],
      queryFn: async () => {
        if (!state.accountAddress) return []

        try {
          const balances = []

          for (const [tokenName, tokenAddress] of Object.entries(
            SUPPORTED_TOKENS,
          )) {
            try {
              const balance = await publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [state.accountAddress as Address],
              })

              const decimals = await publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'decimals',
              })

              balances.push({
                address: tokenAddress,
                symbol: tokenName,
                balance: balance.toString(),
                formattedBalance: `${formatUnits(balance, decimals)} ${tokenName}`,
              })
            } catch (_error) {
              console.error(`Failed to fetch ${tokenName} balance:`, _error)
            }
          }

          return balances
        } catch (_error) {
          return []
        }
      },
      enabled: account.isConnected && !!state.accountAddress,
      refetchInterval: 30000,
      retry: 1,
      retryDelay: 5000,
    })

  const initializeRhinestoneAccount = useCallback(async () => {
    const hasWagmiAccount = Boolean((walletClient as any)?.account)
    if (!account.isConnected || !walletClient || !hasWagmiAccount) {
      console.log('❌ Rhinestone initialization skipped - wallet not connected')
      setState((prev) => ({
        ...prev,
        rhinestoneAccount: null,
        accountAddress: null,
        rhinestoneConfig: null,
        error: null,
      }))
      return
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      const apiKey = import.meta.env.VITE_RHINESTONE_API_KEY

      if (!apiKey) {
        throw new Error(
          '❌ Rhinestone API key not configured in environment variables',
        )
      }

      const account = walletClientToAccount(walletClient)
      const wrappedAccount = wrapParaAccount(account)

      const sdk = new RhinestoneSDK({
        apiKey,
        bundler: {
          type: 'pimlico',
          apiKey: import.meta.env.VITE_PIMLICO_API_KEY,
        },
      })

      const rhinestoneAccount = await sdk.createAccount({
        owners: {
          type: 'ecdsa' as const,
          accounts: [wrappedAccount],
        },
      })

      const accountAddress = rhinestoneAccount.getAddress()

      const rhinestoneConfig = {
        chain: customSepolia,
        bundlerUrl: undefined,
        paymasterUrl: undefined,
        sponsorshipPolicyId: undefined,
        rhinestoneApiKey: apiKey,
      }

      setState((prev) => ({
        ...prev,
        rhinestoneAccount,
        accountAddress,
        rhinestoneConfig,
        isLoading: false,
        error: null,
      }))
    } catch (error) {
      console.error('Failed to initialize Rhinestone account:', error)

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: String(error),
      }))
    }
  }, [account.isConnected, walletClient])

  const sendTransaction = useCallback(
    async (calls: any[]): Promise<any> => {
      if (!state.rhinestoneAccount) {
        throw new Error('Rhinestone account not initialized')
      }

      try {
        console.log('🚀 Sending transaction with calls:', calls)

        const result = await state.rhinestoneAccount.sendUserOperation({
          chain: customSepolia,
          calls: calls,
        })

        console.log('📋 Transaction result:', result)
        console.log('📋 Result keys:', Object.keys(result || {}))

        if (!result) {
          throw new Error(
            'Transaction returned null - transaction may have failed',
          )
        }

        const txHash = getTxHashResult(result)

        console.log('✅ Transaction submitted:', txHash)

        console.log('⏳ Waiting for transaction execution...')
        const executionResult =
          await state.rhinestoneAccount.waitForExecution(result)
        console.log('✅ Transaction execution confirmed!', executionResult)

        if (executionResult && (executionResult as any).status === 'reverted') {
          throw new Error('Transaction was reverted')
        }

        return {
          transaction: result,
          result: executionResult,
          fillTransactionHash: txHash,
        }
      } catch (error) {
        console.error('Transaction failed:', error)
        throw error
      }
    },
    [state.rhinestoneAccount],
  )

  const triggerAutoFunding = useCallback(
    async (accountAddress: string) => {
      if (state.isAutoFunding) {
        return
      }

      const MINIMUM_BALANCE_USD = 12
      let totalBalanceUSD = 0

      if (stablecoinBalances && stablecoinBalances.length > 0) {
        for (const balance of stablecoinBalances) {
          const match = balance.formattedBalance?.match(
            /^([\d.]+)\s+(USDC|DAI)$/i,
          )
          if (match && match[1]) {
            const amount = parseFloat(match[1])
            if (!Number.isNaN(amount)) {
              totalBalanceUSD += amount
            }
          }
        }
      }

      if (totalBalanceUSD >= MINIMUM_BALANCE_USD) {
        console.log(
          `💰 Sufficient balance ($${totalBalanceUSD.toFixed(2)}), skipping autofund`,
        )
        return
      }

      console.log(
        `💸 Insufficient balance ($${totalBalanceUSD.toFixed(2)}), triggering autofund`,
      )

      setState((prev) => ({
        ...prev,
        isAutoFunding: true,
        autoFundingError: null,
      }))

      try {
        const apiBaseUrl =
          import.meta.env.VITE_API_BASE_URL ||
          'https://api-worker.ens.workers.dev'
        const response = await fetch(`${apiBaseUrl}/p/fund-smart-account`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ accountAddress }),
        })

        if (!response.ok) {
          const errorData = (await response
            .json()
            .catch(() => ({ error: 'Unknown error' }))) as { error: string }
          throw new Error(errorData.error || 'Failed to fund smart account')
        }

        const result = (await response.json()) as {
          success: boolean
          daiTxHash?: string
          usdcTxHash?: string
          ethTxHash?: string
        }

        console.log('✅ Auto-funding initiated:', result)

        queryClient.invalidateQueries({
          queryKey: ['stablecoinBalances', accountAddress],
        })
        queryClient.invalidateQueries({
          queryKey: ['smartAccountEthBalance', accountAddress],
        })
        if (account.address) {
          queryClient.invalidateQueries({
            queryKey: ['eoaEthBalance', account.address],
          })
        }
      } catch (error) {
        console.error('❌ Auto-funding failed:', error)
        setState((prev) => ({
          ...prev,
          isAutoFunding: false,
          autoFundingError:
            error instanceof Error ? error.message : 'Unknown error',
        }))
      } finally {
        setTimeout(() => {
          setState((prev) => ({
            ...prev,
            isAutoFunding: false,
          }))
        }, 5000)
      }
    },
    [state.isAutoFunding, stablecoinBalances, queryClient, account.address],
  )

  useEffect(() => {
    initializeRhinestoneAccount()
  }, [initializeRhinestoneAccount])

  useEffect(() => {
    if (
      state.accountAddress &&
      !state.isLoading &&
      !isLoadingBalances &&
      !state.isAutoFunding
    ) {
      triggerAutoFunding(state.accountAddress)
    }
  }, [
    state.accountAddress,
    state.isLoading,
    isLoadingBalances,
    state.isAutoFunding,
    triggerAutoFunding,
  ])

  return {
    ...state,
    address: state.accountAddress,
    isConnected:
      account.isConnected &&
      !!state.accountAddress &&
      !!state.rhinestoneAccount,
    sendTransaction,
    stablecoinBalances,
    isLoadingBalances,
    eoaEthBalance,
    smartAccountEthBalance,
    isLoadingEoaEth,
    isLoadingSmartAccountEth,
  }
}
