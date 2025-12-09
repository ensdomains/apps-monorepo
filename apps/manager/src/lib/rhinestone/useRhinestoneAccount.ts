'use client'

import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  useClient as useParaClient,
  useWallet as useParaWallet,
} from '@getpara/react-sdk-lite'
import { createParaAccount } from '@getpara/viem-v2-integration'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  createSmartAccountClient,
  type SmartAccountClient,
} from 'permissionless'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { toOwner } from 'permissionless/utils'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { type Address, formatUnits, http, parseUnits } from 'viem'
import { entryPoint07Address } from 'viem/account-abstraction'
import { useWalletClient } from 'wagmi'
import { SUPPORTED_TOKENS } from '@/features/register/services/nameChainContractService'
import { customSepolia, publicClient } from '@/lib/wagmi'
import { backendClient } from '@/utils/backend-client'
import { ERC20_ABI } from '../ens.abi'
import { wrapParaAccount } from './utils'

export type WalletSource = 'para-embedded' | 'external-wallet' | null

export interface SmartAccountState {
  smartAccountClient: SmartAccountClient | null
  accountAddress: string | null
  isLoading: boolean
  error: string | null
}

export interface UseSmartAccountConfig {
  accountType?: 'simple' | 'hca'
  hcaFactoryAddress?: Address
}

export function useSmartAccount(config?: UseSmartAccountConfig) {
  const accountType = config?.accountType || 'simple'
  const hcaFactoryAddress =
    config?.hcaFactoryAddress || ENS_SEPOLIA_CONTRACTS.HCAFactory

  const paraClient = useParaClient()
  const { data: paraWallet } = useParaWallet()
  const { data: wagmiWalletClient } = useWalletClient()

  const wagmiAddress = wagmiWalletClient?.account?.address
  const hasWagmi = !!wagmiAddress
  const hasPara = !paraWallet?.isExternal && !!paraWallet && !!paraClient

  const walletSource: WalletSource =
    paraWallet?.isExternal && hasWagmi
      ? 'external-wallet'
      : hasPara
        ? 'para-embedded'
        : null

  const isReady = (paraWallet?.isExternal && hasWagmi) || hasPara

  const [state, setState] = useState<SmartAccountState>({
    smartAccountClient: null,
    accountAddress: null,
    isLoading: false,
    error: null,
  })

  // prevent multiple initializations
  const initializedRef = useRef<string | null>(null)

  const { data: smartAccountEthBalance, isLoading: isLoadingSmartAccountEth } =
    useQuery({
      queryKey: $qk({
        $scope: 'wallet',
        $action: 'getSmartAccountEthBalance',
        address: state.accountAddress,
      }),
      queryFn: async () => {
        if (!state.accountAddress) return null
        const balance = await publicClient.getBalance({
          address: state.accountAddress as Address,
        })
        return {
          balance: balance.toString(),
          formattedBalance: `${parseFloat(formatUnits(balance, 18)).toFixed(4)} ETH`,
        }
      },
      enabled: !!state.accountAddress,
      refetchInterval: 30000,
    })

  const { data: stablecoinBalances = [], isLoading: isLoadingBalances } =
    useQuery({
      queryKey: $qk({
        $scope: 'wallet',
        $action: 'getStablecoinBalances',
        address: state.accountAddress,
      }),
      queryFn: async () => {
        if (!state.accountAddress) return []
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
              decimals: decimals,
              formattedBalance: `${formatUnits(balance, decimals)} ${tokenName}`,
            })
          } catch {
            // Skip failed fetches
          }
        }
        return balances
      },
      enabled: !!state.accountAddress,
      refetchInterval: 30000,
    })

  const fundWalletMutation = useMutation({
    mutationKey: $qk({
      $scope: 'wallet',
      $action: 'fund',
      address: state.accountAddress,
    }),
    mutationFn: async (address: Address) => {
      toast.loading('Funding wallet', {
        description: `Funding wallet ${address} with mock USDC & DAI tokens`,

        id: `fund-wallet-${address}`,
      })
      console.debug('Wallet Funder: Funding wallet', address)

      const response = await backendClient.wallet.fund.$post({
        json: {
          address,
        },
      })
      if (!response.ok) {
        throw new Error(
          `Failed to fund wallet: ${response.statusText} ${await response.text()}`,
        )
      }

      return response.json()
    },
    onSuccess: (data, address, _, context) => {
      if (!data || data.usdcTxHash || !data.daiTxHash) {
        console.log(
          'Wallet Funder: No transaction hashes received, assuming already funded',
        )
        return
      }

      toast.success('Wallet funded successfully', {
        description: `Wallet ${address} funded successfully`,
        id: `fund-wallet-${address}`,
      })

      console.log('Wallet Funder: Successfully funded wallet', address, data)

      context.client.invalidateQueries({
        queryKey: $qk({
          $scope: 'wallet',
          $action: 'getStablecoinBalances',
        }),
      })
    },
    onError: (error, address) => {
      toast.error('Failed to fund wallet', {
        description: `Failed to fund wallet: ${error.message}`,
        id: `fund-wallet-${address}`,
      })
    },
  })

  useEffect(() => {
    const init = async () => {
      if (!isReady) return

      const key =
        walletSource === 'external-wallet'
          ? `external-${wagmiAddress}`
          : `para-${paraClient?.toString()}`

      if (initializedRef.current === key) return

      setState((prev) => ({ ...prev, isLoading: true, error: null }))

      try {
        const PIMLICO_API_KEY = import.meta.env.VITE_PIMLICO_API_KEY
        if (!PIMLICO_API_KEY) throw new Error('Pimlico API key not configured')

        const PIMLICO_URL = `https://api.pimlico.io/v2/${customSepolia.id}/rpc?apikey=${PIMLICO_API_KEY}`

        let ownerAccount: Parameters<typeof toSimpleSmartAccount>[0]['owner']

        if (walletSource === 'external-wallet' && wagmiWalletClient) {
          ownerAccount = await toOwner({ owner: wagmiWalletClient })
        } else if (walletSource === 'para-embedded' && paraClient) {
          ownerAccount = wrapParaAccount(
            createParaAccount(paraClient),
          ) as typeof ownerAccount
        } else {
          throw new Error('No valid wallet connection')
        }

        // TODO: HCA support
        if (accountType === 'hca') {
          console.warn(
            'HCA not implemented. Using SimpleAccount. Factory:',
            hcaFactoryAddress,
          )
        }

        const smartAccount = await toSimpleSmartAccount({
          owner: ownerAccount,
          client: publicClient,
          entryPoint: { address: entryPoint07Address, version: '0.7' },
        })

        const pimlicoClient = createPimlicoClient({
          transport: http(PIMLICO_URL),
          entryPoint: { address: entryPoint07Address, version: '0.7' },
        })

        const client = createSmartAccountClient({
          account: smartAccount,
          chain: customSepolia,
          bundlerTransport: http(PIMLICO_URL),
          paymaster: pimlicoClient,
          userOperation: {
            estimateFeesPerGas: async () =>
              (await pimlicoClient.getUserOperationGasPrice()).fast,
          },
        })

        initializedRef.current = key

        setState({
          smartAccountClient: client,
          accountAddress: smartAccount.address,
          isLoading: false,
          error: null,
        })
      } catch (error) {
        console.error('Failed to initialize smart account:', error)
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : String(error),
        }))
      }
    }

    init()
  }, [
    walletSource,
    wagmiWalletClient,
    wagmiAddress,
    paraClient,
    isReady,
    accountType,
    hcaFactoryAddress,
  ])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Should not attempt to rerun from mutation status
  useEffect(() => {
    if (
      !state.accountAddress ||
      state.isLoading ||
      isLoadingBalances ||
      !fundWalletMutation.isIdle
    )
      return

    // Don't fund if the address already has enough tokens
    const totalBalance = stablecoinBalances.reduce(
      (acc, balance) =>
        acc + BigInt(balance.balance) / BigInt(10 ** balance.decimals),
      0n,
    )

    if (totalBalance >= 50n) {
      console.debug('Wallet Funder: Address already has enough tokens')
      return
    }

    fundWalletMutation.mutate(state.accountAddress as Address)
  }, [state.accountAddress, state.isLoading, isLoadingBalances])

  return {
    ...state,
    autoFundingMutation: fundWalletMutation,
    address: state.accountAddress,
    isConnected: isReady && !!state.smartAccountClient,
    stablecoinBalances,
    isLoadingBalances,
    smartAccountEthBalance,
    isLoadingSmartAccountEth,
    walletSource,
    ownerAddress: walletSource === 'external-wallet' ? wagmiAddress : null,
    // Backward compatibility, we keep this for backward compatibility
    rhinestoneAccount: state.smartAccountClient,
    rhinestoneConfig: { chain: customSepolia, accountType },
  }
}

// TODO: Remove this once we have a proper useRhinestoneAccount hook
export const useRhinestoneAccount = useSmartAccount
export const useParaPimlicoAccount = useSmartAccount
