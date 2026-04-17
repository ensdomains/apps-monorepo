/**
 * Pure Handler Functions for Profile Editing & Resolver/Primary Updates
 *
 * Business logic extracted outside React components for testability.
 */

import type {
  primaryNameMachine,
  resolverMachine,
} from '@ens-apps/transaction-manager'
import type { FormEvent } from 'react'
import type { Address, PublicClient } from 'viem'
import { isAddress } from 'viem'
import type { ActorRefFrom } from 'xstate'
import type { SmartAccountContextValue } from '@/lib/smart-account'
import type { ProfileRecordsResult } from '../service/profileRecords'
import type { ProfileRecords } from '../types'

const ETH_COIN_TYPE = 60

export function getEthAddressFromRecords(
  records: ProfileRecordsResult | undefined,
): string | undefined {
  return records?.coins?.find((c) => c.coinType === ETH_COIN_TYPE)?.value
}

export function hasMatchingEthAddress(
  records: ProfileRecordsResult | undefined,
  walletAddress: string | undefined,
): boolean {
  if (!walletAddress) return false
  const ethAddress = getEthAddressFromRecords(records)
  if (!ethAddress) return false
  return ethAddress.toLowerCase() === walletAddress.toLowerCase()
}

export interface ProfileUpdateParams {
  name: string
  ownerAddress?: Address
  resolverAddress?: Address
  defaultValues: ProfileRecords
  currentValues: ProfileRecords
}

export interface ProfileUpdateOptions {
  account: SmartAccountContextValue
  publicClient: PublicClient
}

export interface ResolverUpdateParams {
  name: string
  resolverInput: string
}

export interface ResolverUpdateOptions {
  account: SmartAccountContextValue
  resolverActor: ActorRefFrom<typeof resolverMachine>
  publicClient: PublicClient
}

export interface PrimaryNameParams {
  name: string
  owner?: Address
}

export interface PrimaryNameOptions {
  account: {
    walletClient?: import('viem').WalletClient | null
    ownerAddress?: Address | null
    signer?: import('@ens-apps/transaction-manager').Signer | null
    accountAddress?: Address | null
  }
  primaryNameActor: ActorRefFrom<typeof primaryNameMachine>
  publicClient: PublicClient
}

export interface ProfileResetParams {
  resetForm: () => void
  refetchRecords: () => void
  refetchOwner: () => void
}

export function handleProfileFormSubmit(
  event: FormEvent<HTMLFormElement>,
  onSubmit: () => void,
): void {
  event.preventDefault()
  event.stopPropagation()
  onSubmit()
}

/**
 * Validates resolver input and dispatches resolver update to the machine.
 *
 * Returns an error message when validation fails so the component can display it.
 */
export function handleResolverUpdate(
  params: ResolverUpdateParams,
  options: ResolverUpdateOptions,
): string | undefined {
  const { name, resolverInput } = params
  const { account, resolverActor, publicClient } = options

  if (!resolverInput) {
    return 'Resolver address is required.'
  }

  if (!isAddress(resolverInput, { strict: false })) {
    return 'Please enter a valid resolver contract address.'
  }

  if (!account.signer || !account.accountAddress) {
    const message = 'Account not ready. Please wait for wallet to connect.'
    console.error('❌ Smart account not connected or not initialized', {
      accountAddress: account.accountAddress,
      hasSigner: !!account.signer,
      type: account.type,
    })
    alert(message)
    return message
  }

  const accountAddress = (account.ownerAddress ??
    account.accountAddress) as Address

  console.log('✅ Creating START_UPDATE event for resolver:', {
    name,
    resolver: resolverInput,
    accountAddress,
    hasSigner: !!account.signer,
    hasPublicClient: !!publicClient,
  })

  resolverActor.send({
    type: 'START_UPDATE',
    name,
    resolver: resolverInput as Address,
    signer: account.signer,
    accountAddress,
    publicClient,
  })

  return undefined
}

export function handleResolverCancel(
  resolverActor: ActorRefFrom<typeof resolverMachine>,
): void {
  resolverActor.send({ type: 'CANCEL' })
}

/**
 * Starts the primary name update flow.
 *
 * Uses the signature flow when a smart account is available:
 * 1. EOA signs an authorization message (free, no gas)
 * 2. Smart account submits the transaction (gasless via paymaster)
 * 3. Primary name is set for the EOA address
 *
 * Falls back to direct EOA signing if no smart account is available.
 *
 * Returns an error message for missing prerequisites so the caller can surface it.
 */
export function handleSetPrimaryName(
  params: PrimaryNameParams,
  options: PrimaryNameOptions,
): string | undefined {
  const { name, owner } = params
  const { account, primaryNameActor, publicClient } = options

  if (!owner) {
    const message = 'Cannot set primary name - ENS owner is not available.'
    console.warn(message)
    alert(message)
    return message
  }

  const walletClient = account.walletClient
  if (!walletClient || !account.ownerAddress) {
    const message =
      'Cannot set primary name - wallet not connected. Please connect your wallet.'
    console.error('❌ EOA wallet not available for primary name', {
      hasWalletClient: !!walletClient,
      ownerAddress: account.ownerAddress,
    })
    alert(message)
    return message
  }

  // Check if we have a smart account signer available
  const hasSmartAccountSigner =
    account.signer && account.signer.type !== 'eoa' && account.accountAddress

  if (hasSmartAccountSigner) {
    // Use signature flow: EOA signs, smart account submits
    console.log(
      '✅ Creating START_UPDATE event for primary name (signature flow):',
      {
        name,
        eoaAddress: account.ownerAddress,
        smartAccountAddress: account.accountAddress,
        signerType: account.signer?.type,
        hasPublicClient: !!publicClient,
      },
    )

    primaryNameActor.send({
      type: 'START_UPDATE',
      name,
      signer: account.signer!,
      accountAddress: account.accountAddress as Address,
      publicClient,
      // Signature flow fields
      walletClient,
      eoaAddress: account.ownerAddress as Address,
    })
  } else {
    // Fallback: direct EOA signing
    const eoaSigner = {
      type: 'eoa' as const,
      walletClient,
    }

    console.log(
      '✅ Creating START_UPDATE event for primary name (EOA direct):',
      {
        name,
        accountAddress: account.ownerAddress,
        signerType: 'eoa',
        hasPublicClient: !!publicClient,
      },
    )

    primaryNameActor.send({
      type: 'START_UPDATE',
      name,
      signer: eoaSigner,
      accountAddress: account.ownerAddress as Address,
      publicClient,
    })
  }

  return undefined
}

export function handlePrimaryNameCancel(
  primaryNameActor: ActorRefFrom<typeof primaryNameMachine>,
): void {
  primaryNameActor.send({ type: 'CANCEL' })
}

export function handleProfileReset(params: ProfileResetParams): void {
  const { resetForm, refetchRecords, refetchOwner } = params
  resetForm()
  refetchRecords()
  refetchOwner()
}
