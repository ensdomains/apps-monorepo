/**
 * Pure Handler Functions for RegistrationPage
 *
 * Business logic extracted outside React components for testability.
 */

import type { registrationMachine, Signer } from '@ens-apps/transaction-manager'
import type { RhinestoneConfig } from '@ens-apps/transaction-manager/types/transaction.types'
import type { SmartAccountClient } from 'permissionless'
import type { Address, PublicClient } from 'viem'
import type { ActorRefFrom } from 'xstate'
import { SUPPORTED_TOKENS } from '../services/nameChainContractService'

export interface StartRegistrationParams {
  name: string
  duration: number // years
  selectedToken: Address
  tokenPrice: bigint
}

// TODO: Rename to SmartAccountInfo for clarity and consistency
export interface AccountInfo {
  rhinestoneAccount: SmartAccountClient
  accountAddress: Address | null
  rhinestoneConfig: RhinestoneConfig
  publicClient: PublicClient
}

/**
 * Handle starting the registration flow
 *
 * Validates account readiness, creates the Signer, and sends START_REGISTRATION event to the machine.
 * Shows an alert if validation fails.
 */
export function handleStartRegistration(
  params: StartRegistrationParams,
  account: AccountInfo,
  actor: ActorRefFrom<typeof registrationMachine>,
  options?: { fast?: boolean },
): void {
  const { name, duration, selectedToken, tokenPrice } = params
  const { rhinestoneAccount, accountAddress, rhinestoneConfig, publicClient } =
    account

  const useFastRegistrar = Boolean(options?.fast)

  if (!accountAddress || !rhinestoneAccount || !rhinestoneConfig) {
    console.error('❌ Account not connected or not initialized', {
      accountAddress,
      hasRhinestoneAccount: !!rhinestoneAccount,
      hasRhinestoneConfig: !!rhinestoneConfig,
    })
    alert('Account not ready. Please wait for wallet to connect.')
    return
  }

  // Create Signer from Pimlico smart account
  // Use 'pimlico' type to use the new Para + Pimlico implementation
  const signer: Signer = {
    type: 'pimlico',
    account: rhinestoneAccount, // This is actually the SmartAccountClient from permissionless
    config: {
      ...rhinestoneConfig,
      accountAddress: accountAddress,
    },
  }

  const token = selectedToken === SUPPORTED_TOKENS.DAI ? 'DAI' : 'USDC'

  const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)

  const enableSponsorship =
    import.meta.env.VITE_ENABLE_TX_SPONSORSHIP === undefined
      ? true // Default to true for testnet
      : import.meta.env.VITE_ENABLE_TX_SPONSORSHIP === 'true'

  console.log('✅ Creating START_REGISTRATION event:', {
    name,
    duration: durationInSeconds,
    token,
    price: tokenPrice,
    hasSigner: !!signer,
    hasPublicClient: !!publicClient,
    useFastRegistrar,
    sponsored: enableSponsorship,
  })

  // Send event to machine with all necessary data
  actor.send({
    type: 'START_REGISTRATION',
    name,
    duration: durationInSeconds,
    token,
    price: tokenPrice,
    signer,
    accountAddress: accountAddress as Address,
    publicClient,
    useFastRegistrar,
    sponsored: enableSponsorship,
  })
}
