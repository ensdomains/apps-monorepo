/**
 * Pure Handler Functions for RegistrationPage
 *
 * Business logic extracted outside React components for testability.
 */

import type { registrationMachine } from '@ens-apps/transaction-manager'
import type { Address, PublicClient } from 'viem'
import type { ActorRefFrom } from 'xstate'
import type { SmartAccountContextValue } from '@/lib/smart-account'
import { durationYearsToSeconds } from '../components/Pricing/utils'
import { SUPPORTED_TOKENS } from '../services/nameChainContractService'

export interface StartRegistrationParams {
  name: string
  duration: number // years
  selectedToken: Address
  tokenPrice: bigint
}

export interface HandleRegistrationOptions {
  fast?: boolean
  publicClient: PublicClient
}

/**
 * Unified handler that starts registration with any smart account type
 *
 * Uses the pre-computed signer from the smart account context hook.
 * This is the main entry point for starting registration.
 *
 * @example
 * const account = useSmartAccountContext()
 * handleStartRegistration(params, account, actor, { publicClient, fast: true })
 */
export function handleStartRegistration(
  params: StartRegistrationParams,
  account: SmartAccountContextValue,
  actor: ActorRefFrom<typeof registrationMachine>,
  options: HandleRegistrationOptions,
): void {
  const { name, duration, selectedToken, tokenPrice } = params
  const { publicClient, fast = true } = options

  // Validate account is ready - signer is pre-computed by the hook
  if (!account.signer || !account.accountAddress) {
    console.error('❌ Smart account not connected or not initialized', {
      accountAddress: account.accountAddress,
      hasSigner: !!account.signer,
      type: account.type,
    })
    alert('Account not ready. Please wait for wallet to connect.')
    return
  }

  const token = selectedToken === SUPPORTED_TOKENS.DAI ? 'DAI' : 'USDC'
  const durationInSeconds = durationYearsToSeconds(duration)
  const useFastRegistrar = Boolean(fast)

  const enableSponsorship =
    import.meta.env.VITE_ENABLE_TX_SPONSORSHIP === undefined
      ? true // Default to true for testnet
      : import.meta.env.VITE_ENABLE_TX_SPONSORSHIP === 'true'

  // For HCA accounts:
  //   - Use the EOA address as the owner (ownerAddress is set)
  //   - The smart account will be used for the transaction (sponsorship)
  //   - But the ENS name will be owned by the EOA
  // For Para embedded wallets, ownerAddress contains the EOA address from the Para account
  // For external wallets, ownerAddress contains the wagmi address (EOA)
  // If ownerAddress is not set, fall back to smart account address (for simple accounts)
  const ownerAddress = account.ownerAddress ?? account.accountAddress
  // EACL grantee for the dedicated resolver. The PermissionedResolver unwraps
  // SCA→EOA at write time, so this must always be the EOA. In the legacy v1
  // flow ownerAddress already prefers the EOA, so we alias it here. The
  // meaningful SCA/EOA split lives in registrationUi.machine.ts (v2 flow).
  const resolverOwnerAddress = ownerAddress

  console.log(`✅ Creating START_REGISTRATION event with ${account.type}:`, {
    name,
    duration: durationInSeconds,
    token,
    price: tokenPrice,
    hasSigner: !!account.signer,
    hasPublicClient: !!publicClient,
    useFastRegistrar,
    sponsored: enableSponsorship,
    ownerAddress,
    smartAccountAddress: account.accountAddress,
  })

  // Send event to machine - uses pre-computed signer from hook
  actor.send({
    type: 'START_REGISTRATION',
    name,
    duration: durationInSeconds,
    token,
    price: tokenPrice,
    signer: account.signer,
    accountAddress: account.accountAddress,
    ownerAddress, // HCA-only: register the ENS name to the EOA
    resolverOwnerAddress, // Always the EOA — resolver EACL grantee
    publicClient,
    useFastRegistrar,
    sponsored: enableSponsorship,
  })
}
