/**
 * Pure Handler Functions for RegistrationPage
 *
 * Business logic extracted outside React components for testability.
 */

import type { registrationMachine, Signer } from '@ens-apps/transaction-manager'
import type { Address, PublicClient } from 'viem'
import type { ActorRefFrom } from 'xstate'
import { SUPPORTED_TOKENS } from '../services/nameChainContractService'

export interface StartRegistrationParams {
  name: string
  duration: number // years
  selectedToken: Address
  tokenPrice: bigint
}

export interface AccountInfo {
  rhinestoneAccount: any
  accountAddress: string | null
  rhinestoneConfig: any
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

  console.log('🔍 handleStartRegistration called with:', {
    accountAddress,
    hasRhinestoneAccount: !!rhinestoneAccount,
    params,
    useFastRegistrar,
  })

  // Validation
  if (!accountAddress || !rhinestoneAccount || !rhinestoneConfig) {
    console.error('❌ Account not connected or not initialized', {
      accountAddress,
      hasRhinestoneAccount: !!rhinestoneAccount,
      hasRhinestoneConfig: !!rhinestoneConfig,
    })
    alert('Account not ready. Please wait for wallet to connect.')
    return
  }

  // Create Signer from Rhinestone account
  const signer: Signer = {
    type: 'rhinestone',
    account: rhinestoneAccount,
    config: rhinestoneConfig,
  }

  // Map token address to token name
  const token = selectedToken === SUPPORTED_TOKENS.DAI ? 'DAI' : 'USDC'

  // Convert years to seconds
  const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)

  console.log('✅ Creating START_REGISTRATION event:', {
    name,
    duration: durationInSeconds,
    token,
    price: tokenPrice,
    hasSigner: !!signer,
    hasPublicClient: !!publicClient,
    useFastRegistrar,
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
  })
}
