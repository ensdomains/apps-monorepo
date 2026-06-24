/**
 * Handler functions for primary-name updates.
 *
 * Business logic extracted outside React components for testability.
 */

import type { primaryNameMachine, Signer } from '@ens-apps/transaction-manager'
import type { Address, PublicClient, WalletClient } from 'viem'
import type { ActorRefFrom } from 'xstate'
import type { ProfileRecordsResult } from '@/features/profile/service/profileRecords'

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

export interface PrimaryNameParams {
  name: string
  owner?: Address
}

interface PrimaryNameAccount {
  walletClient?: WalletClient | null
  ownerAddress?: Address | null
  signer?: Signer | null
  accountAddress?: Address | null
}

export interface PrimaryNameOptions {
  account: PrimaryNameAccount
  primaryNameActor: ActorRefFrom<typeof primaryNameMachine>
  publicClient: PublicClient
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
  if (
    !walletClient ||
    !account.ownerAddress ||
    !account.signer ||
    !account.accountAddress
  ) {
    const message =
      'Cannot set primary name - account not ready. Please wait for wallet to connect.'
    console.error(message)
    alert(message)
    return message
  }

  primaryNameActor.send({
    type: 'START_UPDATE',
    name,
    signer: account.signer,
    accountAddress: account.accountAddress,
    publicClient,
    walletClient,
    eoaAddress: account.ownerAddress,
  })

  return undefined
}

export function handlePrimaryNameCancel(
  primaryNameActor: ActorRefFrom<typeof primaryNameMachine>,
): void {
  primaryNameActor.send({ type: 'CANCEL' })
}
