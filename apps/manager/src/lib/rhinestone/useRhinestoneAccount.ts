'use client'

import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { useQuery } from '@tanstack/react-query'
import { createSmartAccountClient } from 'permissionless'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { useEffect, useState } from 'react'
import { type Address, createPublicClient, formatUnits, http } from 'viem'
import { entryPoint07Address } from 'viem/account-abstraction'
import { sepolia } from 'viem/chains'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'
import { ERC20_ABI } from '../ens.abi'
import { wrapParaAccount } from './rhinestone-utils'
import { useViemAccount } from './useViemAccount'

const SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'

export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [SEPOLIA_RPC_URL] },
    public: { http: [SEPOLIA_RPC_URL] },
  },
}

const publicClient = createPublicClient({
  chain: customSepolia,
  transport: http(SEPOLIA_RPC_URL),
})

export interface SmartAccountState {
  smartAccountClient: any | null
  accountAddress: string | null
  isLoading: boolean
  error: string | null
}

export interface UseParaPimlicoAccountConfig {
  accountType?: 'simple' | 'hca'
  hcaFactoryAddress?: Address
}

export function useParaPimlicoAccount(config?: UseParaPimlicoAccountConfig) {
  const { viemAccount, isLoading: accountLoading } = useViemAccount()
  const accountType = config?.accountType || 'simple'
  const hcaFactoryAddress =
    config?.hcaFactoryAddress || ENS_SEPOLIA_CONTRACTS.HCAFactory

  const [state, setState] = useState<SmartAccountState>({
    smartAccountClient: null,
    accountAddress: null,
    isLoading: true,
    error: null,
  })

  // Keep your existing balance queries
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
      enabled: !!state.accountAddress,
      refetchInterval: 30000,
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
      enabled: !!state.accountAddress,
      refetchInterval: 30000,
    })

  // Initialize Smart Account
  useEffect(() => {
    const initializeClient = async () => {
      if (!viemAccount || accountLoading) {
        setState((prev) => ({
          ...prev,
          smartAccountClient: null,
          accountAddress: null,
          error: null,
        }))
        return
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }))

      try {
        const PIMLICO_API_KEY = import.meta.env.VITE_PIMLICO_API_KEY
        if (!PIMLICO_API_KEY) {
          throw new Error('Pimlico API key not configured')
        }

        const PIMLICO_URL = `https://api.pimlico.io/v2/${customSepolia.id}/rpc?apikey=${PIMLICO_API_KEY}`

        // Wrap Para account to adjust v-byte
        const wrappedAccount = wrapParaAccount(viemAccount)

        let smartAccount: any

        if (accountType === 'hca') {
          console.log(
            '🔄 Creating HCA (Hybrid Custodial Account) with Para viem account...',
          )
          console.warn(
            '⚠️ HCA implementation needs to be completed. Using SimpleAccount as fallback.',
            'Please implement HCA using toSmartAccount from viem/account-abstraction',
            'with the HCA factory at:',
            hcaFactoryAddress,
          )

          // TODO: Implement proper HCA using toSmartAccount from viem/account-abstraction

          // For now, using SimpleAccount as fallback
          smartAccount = await toSimpleSmartAccount({
            owner: wrappedAccount as any,
            client: publicClient,
            entryPoint: {
              address: entryPoint07Address,
              version: '0.7',
            },
          })

          console.log(
            '📦 HCA (using SimpleAccount as fallback):',
            smartAccount.address,
          )
        } else {
          console.log(
            '🔄 Creating Simple Smart Account with Para viem account...',
          )

          // Create SimpleAccount with wrapped Para account as owner
          smartAccount = await toSimpleSmartAccount({
            owner: wrappedAccount as any,
            client: publicClient,
            entryPoint: {
              address: entryPoint07Address,
              version: '0.7',
            },
          })

          // Check if account is already deployed
          const accountCode = await publicClient.getCode({
            address: smartAccount.address,
          })
          const isDeployed = accountCode && accountCode !== '0x'

          console.log('📦 Account status:', {
            address: smartAccount.address,
            isDeployed,
          })

          // If account is already deployed, override getInitCode to prevent redeployment
          if (isDeployed) {
            console.log('🔧 Account already deployed, skipping initCode...')
            const originalGetInitCode = (smartAccount as any).getInitCode
            if (originalGetInitCode) {
              ;(smartAccount as any).getInitCode = async () => {
                return '0x'
              }
            }
          }

          console.log('📦 Simple account created:', smartAccount.address)
        }

        // Create Pimlico client
        const pimlicoClient = createPimlicoClient({
          transport: http(PIMLICO_URL),
          entryPoint: {
            address: entryPoint07Address,
            version: '0.7',
          },
        })

        // Create Smart Account Client with sponsorship
        const client = createSmartAccountClient({
          account: smartAccount,
          chain: customSepolia,
          bundlerTransport: http(PIMLICO_URL),
          paymaster: pimlicoClient, // Always sponsor
          userOperation: {
            estimateFeesPerGas: async () => {
              return (await pimlicoClient.getUserOperationGasPrice()).fast
            },
          },
        })

        setState({
          smartAccountClient: client,
          accountAddress: smartAccount.address,
          isLoading: false,
          error: null,
        })

        console.log(
          `✅ ${accountType === 'hca' ? 'HCA' : 'Simple'} account initialized:`,
          smartAccount.address,
        )
      } catch (error) {
        console.error('Failed to initialize smart account:', error)
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: String(error),
        }))
      }
    }

    initializeClient()
  }, [viemAccount, accountLoading, accountType, hcaFactoryAddress])

  return {
    ...state,
    address: state.accountAddress,
    isConnected: !!viemAccount && !!state.smartAccountClient,
    stablecoinBalances,
    isLoadingBalances,
    smartAccountEthBalance,
    isLoadingSmartAccountEth,
    // For compatibility with existing code
    rhinestoneAccount: state.smartAccountClient,
    rhinestoneConfig: {
      chain: customSepolia,
      accountType,
      hcaFactoryAddress: accountType === 'hca' ? hcaFactoryAddress : undefined,
    },
  }
}

// Export with old name for compatibility
export const useRhinestoneAccount = useParaPimlicoAccount
