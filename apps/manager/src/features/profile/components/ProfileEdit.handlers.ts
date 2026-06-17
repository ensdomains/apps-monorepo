/**
 * Pure Handler Functions for Profile Editing & Resolver/Primary Updates
 *
 * Business logic extracted outside React components for testability.
 */

import type { FormEvent } from 'react'
import type { Address, PublicClient } from 'viem'
import { isAddress } from 'viem'
import type { SmartAccountContextValue } from '@/lib/smart-account'
import { changeResolver } from '../service/changeResolver'
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
  publicClient: PublicClient
  chainId: number
}

export interface ResolverUpdateResult {
  txId?: string
  error?: string
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
 * Validates resolver input and submits the resolver update through the
 * transaction manager.
 *
 * Returns `{ error }` when validation fails (so the component can display it),
 * or `{ txId }` for the submitted transaction (track it with a selector).
 */
export function handleResolverUpdate(
  params: ResolverUpdateParams,
  options: ResolverUpdateOptions,
): ResolverUpdateResult {
  const { name, resolverInput } = params
  const { account, publicClient, chainId } = options

  if (!resolverInput) {
    return { error: 'Resolver address is required.' }
  }

  if (!isAddress(resolverInput, { strict: false })) {
    return { error: 'Please enter a valid resolver contract address.' }
  }

  if (!account.signer || !account.accountAddress) {
    return { error: 'Account not ready. Please wait for wallet to connect.' }
  }

  const accountAddress = (account.ownerAddress ??
    account.accountAddress) as Address

  const txId = changeResolver({
    name,
    newResolver: resolverInput as Address,
    signer: account.signer,
    accountAddress,
    publicClient,
    chainId,
  })

  return { txId }
}

export function handleProfileReset(params: ProfileResetParams): void {
  const { resetForm, refetchRecords, refetchOwner } = params
  resetForm()
  refetchRecords()
  refetchOwner()
}
