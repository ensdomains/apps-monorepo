/**
 * Pure Handler Functions for RegistrationPage
 *
 * Business logic extracted outside React components for testability.
 */

import type { RegistrationEvent } from '@ens-apps/transaction-manager'
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

export interface StartRegistrationHandlers {
  onSuccess: (event: RegistrationEvent) => void
  onError: (message: string) => void
}

/**
 * Handle starting the registration flow
 */
export function handleStartRegistration(
  params: StartRegistrationParams,
  account: AccountReadiness,
  handlers: StartRegistrationHandlers,
): void {
  const { name, duration, selectedToken, tokenPrice } = params
  const { rhinestoneAccount, accountAddress } = account
  const { onSuccess, onError } = handlers

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
    onError('Account not ready. Please wait for wallet to connect.')
    return
  }

  // Map token address to token name
  const token = selectedToken === SUPPORTED_TOKENS.DAI ? 'DAI' : 'USDC'

  // Convert years to seconds
  const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)

  console.log('✅ Sending START_REGISTRATION event:', {
    name,
    duration: durationInSeconds,
    token,
    price: tokenPrice,
  })

  // Create event
  const event: RegistrationEvent = {
    type: 'START_REGISTRATION',
    name,
    duration: durationInSeconds,
    token,
    price: tokenPrice,
  }

  onSuccess(event)
}
