import React, { useCallback } from 'react'
import { usePublicClient, useWalletClient } from 'wagmi'
import { sepolia } from 'viem/chains'
import { useTransaction } from './useTransaction'
import { RhinestoneAccountService, type ENSRenewalParams } from '../services/rhinestone-account.service'
import type { TransactionOptions } from '../types/transaction.types'

export interface UseENSRenewalOptions {
  useSmartAccount?: boolean
  bundlerUrl?: string
  paymasterUrl?: string
  sponsorshipPolicyId?: string
  rhinestoneApiKey?: string
}

export function useENSRenewal(options?: UseENSRenewalOptions) {
  const publicClient = usePublicClient({ chainId: sepolia.id })
  const { data: walletClient } = useWalletClient()
  const transaction = useTransaction()

  // Cache smart account address to avoid recreating it on every call
  const [cachedSmartAccountAddress, setCachedSmartAccountAddress] = React.useState<string | null>(null)

  const renewName = useCallback(
    async (
      name: string, // e.g., "myname" (without .eth)
      duration: bigint, // Duration in seconds (e.g., 31536000n for 1 year)
      transactionOptions?: TransactionOptions,
    ) => {
      console.log('🔧 renewName called:', {
        name,
        duration: duration.toString(),
        useSmartAccount: options?.useSmartAccount,
        hasWalletClient: !!walletClient,
        walletAddress: walletClient?.account?.address,
        hasPublicClient: !!publicClient,
        hasRhinestoneApiKey: !!options?.rhinestoneApiKey,
        hasBundlerUrl: !!options?.bundlerUrl,
      })

      if (!publicClient) {
        console.error('❌ No public client available')
        return
      }

      if (!walletClient) {
        console.error('❌ No wallet client available - wallet may not be connected')
        return
      }

      if (options?.useSmartAccount) {
        // Use Rhinestone smart account for renewal via transaction manager
        console.log('🚀 Using Rhinestone smart account for ENS renewal')

        const rhinestoneService = new RhinestoneAccountService(
          publicClient,
          walletClient || undefined,
          {
            chain: sepolia,
            bundlerUrl: options.bundlerUrl,
            paymasterUrl: options.paymasterUrl,
            sponsorshipPolicyId: options.sponsorshipPolicyId,
            rhinestoneApiKey: options.rhinestoneApiKey,
          },
        )

        // Get the renewal price and prepare transaction data
        const txResult = await rhinestoneService.prepareENSRenewalTransaction({
          name,
          duration,
        })

        if (txResult.isErr()) {
          console.error('❌ Failed to prepare ENS renewal:', txResult.error)
          return
        }

        const { to, data, value } = txResult.value

        // Execute via transaction manager with Rhinestone smart account
        transaction.execute(
          {
            type: 'rhinestone-intent',
            to,
            data,
            value,
            from: walletClient?.account?.address,
            chainId: sepolia.id,
            rhinestoneParams: { name, duration },
          },
          {
            ...transactionOptions,
            rhinestoneConfig: {
              chain: sepolia,
              bundlerUrl: options.bundlerUrl,
              paymasterUrl: options.paymasterUrl,
              sponsorshipPolicyId: options.sponsorshipPolicyId,
              rhinestoneApiKey: options.rhinestoneApiKey,
            },
          },
        )
      } else {
        // Use regular EOA for renewal
        const rhinestoneService = new RhinestoneAccountService(publicClient)

        // Get the renewal price and prepare transaction
        const txResult = await rhinestoneService.prepareENSRenewalTransaction({
          name,
          duration,
        })

        if (txResult.isErr()) {
          console.error('Failed to prepare ENS renewal:', txResult.error)
          return
        }

        const { to, data, value } = txResult.value

        // Execute via transaction manager with EOA
        transaction.execute(
          {
            type: 'eoa',
            to,
            data,
            value,
            from: walletClient?.account?.address,
          },
          transactionOptions,
        )
      }
    },
    [publicClient, walletClient, options, transaction],
  )

  const getRenewalPrice = useCallback(
    async (name: string, duration: bigint) => {
      if (!publicClient) {
        console.error('No public client available')
        return null
      }

      const rhinestoneService = new RhinestoneAccountService(publicClient)
      const result = await rhinestoneService.getRenewalPrice(name, duration)

      if (result.isErr()) {
        console.error('Failed to get renewal price:', result.error)
        return null
      }

      return result.value
    },
    [publicClient],
  )

  const getSmartAccountAddress = useCallback(
    async () => {
      console.log('🔍 getSmartAccountAddress called:', {
        hasPublicClient: !!publicClient,
        hasWalletClient: !!walletClient,
        walletAddress: walletClient?.account?.address,
        hasRhinestoneApiKey: !!options?.rhinestoneApiKey,
        hasCached: !!cachedSmartAccountAddress,
      })

      // Return cached address if available and wallet hasn't changed
      if (cachedSmartAccountAddress && walletClient?.account?.address) {
        console.log('✅ Returning cached smart account address:', cachedSmartAccountAddress)
        return cachedSmartAccountAddress
      }

      if (!publicClient || !walletClient) {
        console.warn('⚠️ Wallet not connected - cannot get smart account address', {
          hasPublicClient: !!publicClient,
          hasWalletClient: !!walletClient,
        })
        return null
      }

      const rhinestoneService = new RhinestoneAccountService(
        publicClient,
        walletClient || undefined,
        {
          chain: sepolia,
          bundlerUrl: options?.bundlerUrl,
          paymasterUrl: options?.paymasterUrl,
          sponsorshipPolicyId: options?.sponsorshipPolicyId,
          rhinestoneApiKey: options?.rhinestoneApiKey,
        },
      )

      const result = await rhinestoneService.getSmartAccountAddress()

      if (result.isErr()) {
        console.error('Failed to get smart account address:', result.error)
        return null
      }

      const address = result.value
      setCachedSmartAccountAddress(address)
      return address
    },
    [publicClient, walletClient, options, cachedSmartAccountAddress],
  )

  // Clear cache when wallet changes
  React.useEffect(() => {
    setCachedSmartAccountAddress(null)
  }, [walletClient?.account?.address])

  return {
    renewName,
    getRenewalPrice,
    getSmartAccountAddress,
    ...transaction,
  }
}