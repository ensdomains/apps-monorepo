/**
 * Pure Handler Functions for RegistrationPage
 *
 * Business logic extracted outside React components for testability.
 */

import type { registrationMachine, Signer } from '@ens-apps/transaction-manager'
import type { Address, PublicClient } from 'viem'
import type { ActorRefFrom } from 'xstate'
import type { SmartAccountContextValue } from '@/lib/smart-account'
import { durationYearsToSeconds } from '../components/Pricing/utils'

export interface StartRegistrationParams {
  name: string
  duration: number // years
  /**
   * Retained for the legacy picker's plumbing (reducer → useSessionGate), but
   * no longer read: USDC is the only registrar-accepted payment token.
   */
  selectedToken: Address
  tokenPrice: bigint
}

export interface HandleRegistrationOptions {
  publicClient: PublicClient
  /**
   * Signer to use instead of `account.signer`. Pass the session-attached
   * signer returned by `enableSession()` so registration starts with the
   * session in the same tick (the context's `account.signer` only reflects
   * the session after a re-render).
   */
  signerOverride?: Signer
}

/**
 * Unified handler that starts registration with any smart account type
 *
 * Uses the pre-computed signer from the smart account context hook.
 * This is the main entry point for starting registration.
 *
 * @example
 * const account = useSmartAccountContext()
 * handleStartRegistration(params, account, actor, { publicClient })
 */
export function handleStartRegistration(
  params: StartRegistrationParams,
  account: SmartAccountContextValue,
  actor: ActorRefFrom<typeof registrationMachine>,
  options: HandleRegistrationOptions,
): void {
  const { name, duration, tokenPrice } = params
  const { publicClient } = options

  // Prefer an explicitly-provided signer (e.g. one just returned by
  // enableSession with the session freshly attached) over the context's
  // `account.signer`, which may be a stale pre-session snapshot this tick.
  const signer = options.signerOverride ?? account.signer

  // Validate account is ready - signer is pre-computed by the hook
  if (!signer || !account.accountAddress) {
    console.error('❌ Smart account not connected or not initialized', {
      accountAddress: account.accountAddress,
      hasSigner: !!account.signer,
      type: account.type,
    })
    alert('Account not ready. Please wait for wallet to connect.')
    return
  }

  // USDC is the only registrar-accepted payment token; `selectedToken` is kept
  // as an address purely for the legacy picker's plumbing.
  const token = 'USDC' as const
  const durationInSeconds = durationYearsToSeconds(duration)

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

  // EOA signer used to produce the gasless EIP-2612 permit signature for HCA
  // flows (the registrar pulls payment from the EOA owner, so the EOA must
  // authorize the allowance). Carried into the sponsored bundle; the EOA sends
  // no tx. Pure-EOA flows don't need it (they use a plain on-chain `approve`).
  const approvalSigner: Signer | undefined = account.walletClient
    ? { type: 'eoa', walletClient: account.walletClient }
    : undefined

  // HCA flows register the name to the EOA owner and the registrar pulls
  // payment from that owner, so the gasless permit MUST be EOA-signed. Without
  // an `approvalSigner` there's no EOA wallet to produce the permit signature
  // (e.g. a Para embedded wallet mid-reconnect exposing no client). Fail fast
  // with an actionable message here instead of entering the flow, doing
  // commitment/deployment work, and stalling at the `signingPermit` step where
  // `signPermitActor` would reject the rhinestone signer fallback. Mirrors the
  // v2 guard in registrationUi.machine.ts.
  const isHcaRegistration =
    signer.type === 'rhinestone' &&
    ownerAddress.toLowerCase() !== account.accountAddress.toLowerCase()

  if (isHcaRegistration && !approvalSigner) {
    console.error(
      '❌ HCA registration is missing the EOA wallet client for the payment approval',
      {
        accountAddress: account.accountAddress,
        ownerAddress,
        type: account.type,
      },
    )
    alert(
      'Cannot register: the wallet that owns this account is unavailable to sign the payment approval. Please reconnect your wallet and try again.',
    )
    return
  }

  console.log(`✅ Creating START_REGISTRATION event with ${account.type}:`, {
    name,
    duration: durationInSeconds,
    token,
    price: tokenPrice,
    hasSigner: !!signer,
    hasPublicClient: !!publicClient,
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
    signer,
    approvalSigner, // EOA signer for the gasless permit (HCA flows)
    accountAddress: account.accountAddress,
    ownerAddress, // HCA-only: register the ENS name to the EOA
    resolverOwnerAddress, // Always the EOA — resolver EACL grantee
    publicClient,
    sponsored: enableSponsorship,
  })
}
