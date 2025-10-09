import { useCallback } from 'react'
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
}

export function useENSRenewal(options?: UseENSRenewalOptions) {
  const publicClient = usePublicClient({ chainId: sepolia.id })
  const { data: walletClient } = useWalletClient()
  const transaction = useTransaction()

  const renewName = useCallback(
    async (
      name: string, // e.g., "myname" (without .eth)
      duration: bigint, // Duration in seconds (e.g., 31536000n for 1 year)
      transactionOptions?: TransactionOptions,
    ) => {
      if (!publicClient) {
        console.error('No public client available')
        return
      }

      if (options?.useSmartAccount) {
        // Use Rhinestone smart account for renewal via transaction manager
        const rhinestoneService = new RhinestoneAccountService(
          publicClient,
          walletClient || undefined,
          {
            chain: sepolia,
            bundlerUrl: options.bundlerUrl,
            paymasterUrl: options.paymasterUrl,
            sponsorshipPolicyId: options.sponsorshipPolicyId,
          },
        )

        // Get the renewal price and prepare transaction data
        const txResult = await rhinestoneService.prepareENSRenewalTransaction({
          name,
          duration,
        })

        if (txResult.isErr()) {
          console.error('Failed to prepare ENS renewal:', txResult.error)
          return
        }

        const { to, data, value } = txResult.value

        // Execute via transaction manager with smart account
        transaction.execute(
          {
            type: 'erc4337',
            to,
            data,
            value,
            from: walletClient?.account?.address,
          },
          {
            ...transactionOptions,
            // Pass smart account service config
            bundlerUrl: options.bundlerUrl,
            paymasterUrl: options.paymasterUrl,
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
      if (!publicClient || !walletClient) {
        console.warn('Wallet not connected - cannot get smart account address')
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
        },
      )

      const result = await rhinestoneService.getSmartAccountAddress()

      if (result.isErr()) {
        console.error('Failed to get smart account address:', result.error)
        return null
      }

      return result.value
    },
    [publicClient, walletClient, options],
  )

  return {
    renewName,
    getRenewalPrice,
    getSmartAccountAddress,
    ...transaction,
  }
}