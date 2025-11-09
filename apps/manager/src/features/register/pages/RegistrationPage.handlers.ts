/**
 * Pure Handler Functions for RegistrationPage
 *
 * Business logic extracted outside React components for testability.
 */

import type { registrationMachine } from '@ens-apps/transaction-manager'
import type { ActorRefFrom } from 'xstate'
import { SUPPORTED_TOKENS } from '../services/nameChainContractService'

export interface StartRegistrationParams {
  name: string
  duration: number // years
  selectedToken: `0x${string}`
  tokenPrice: bigint
}

export interface AccountReadiness {
  rhinestoneAccount: any
  accountAddress: string | null
}

/**
 * Handle starting the registration flow
 *
 * Validates account readiness, creates the registration event, and sends it to the machine.
 * Shows an alert if validation fails.
 */
export function handleStartRegistration(
  params: StartRegistrationParams,
  account: AccountReadiness,
  actor: ActorRefFrom<typeof registrationMachine>,
): void {
  const { name, duration, selectedToken, tokenPrice } = params
  const { rhinestoneAccount, accountAddress } = account

  console.log('🔍 handleStartRegistration called with:', {
    accountAddress,
    hasRhinestoneAccount: !!rhinestoneAccount,
    params,
  })

  // Validation
  if (!accountAddress || !rhinestoneAccount) {
    console.error('❌ Account not connected or not initialized', {
      accountAddress,
      hasRhinestoneAccount: !!rhinestoneAccount,
    })
    alert('Account not ready. Please wait for wallet to connect.')
    return
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
  })

  // Send event to machine
  actor.send({
    type: 'START_REGISTRATION',
    name,
    duration: durationInSeconds,
    token,
    price: tokenPrice,
  })
}
