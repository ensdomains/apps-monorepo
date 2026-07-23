import { type Signer, waitForTransaction } from '@ens-apps/transaction-manager'
import { parseInput } from '@ensdomains/ensjs/utils'
import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, PublicClient } from 'viem'
import { ensureOwnedPermRes } from '@/features/migration/service/ensureOwnedPermRes'
import { changeResolver } from './changeResolver'

export interface EnsureControlledResolverParams {
  /** ENS name, with or without the `.eth` suffix */
  name: string
  /** EOA owner address — the account the deployed resolver authorizes */
  eoa: Address
  signer: Signer
  /** `from` for EOA transactions (EOA / owner address) */
  accountAddress: Address
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  chainId: number
}

/**
 * Give the connected owner a resolver they control on `name`, then point the
 * name at it. This is the fix for names received via transfer: the name's roles
 * move to the new owner (so they *can* call `setResolver`), but the previous
 * owner's resolver — and its record-write roles — do not. Without a resolver
 * they control, the new owner can neither edit records nor set a primary name.
 *
 * Runs as two steps, mirroring the migration flow:
 *  1. Deploy (or reuse) the owner's dedicated PermissionedResolver. Deployed
 *     via a direct EOA write and keyed off the EOA, so it's shared across all
 *     of the owner's names — a no-op once one exists.
 *  2. `setResolver(name, ownedResolver)` through the transaction manager
 *     (sponsored intent for smart accounts, direct tx for EOAs).
 *
 * Only supports direct `.eth` 2LDs: `changeResolver` derives the tokenId from
 * the leaf label against the root `.eth` registry. Subnames live in a parent
 * registry the manager can't deploy or point at, so this throws for them —
 * before deploying anything — rather than submitting a reverting `setResolver`.
 *
 * Resolves with the resolver address once step 2 is confirmed, so callers can
 * write records to it immediately.
 */
export async function ensureControlledResolver(
  params: EnsureControlledResolverParams,
): Promise<Address> {
  const {
    name,
    eoa,
    signer,
    accountAddress,
    wagmiConfig,
    publicClient,
    chainId,
  } = params

  const fullName = name.endsWith('.eth') ? name : `${name}.eth`
  if (!parseInput(fullName).is2LD) {
    throw new Error(
      'This subname needs a resolver you control, which can’t be set up here. Set one up for it in the ENS app first.',
    )
  }

  const resolver = await ensureOwnedPermRes({
    eoa,
    wagmiConfig,
    publicClient,
  })

  const txId = changeResolver({
    name,
    newResolver: resolver,
    signer,
    accountAddress,
    publicClient,
    chainId,
  })
  await waitForTransaction(txId)

  return resolver
}
