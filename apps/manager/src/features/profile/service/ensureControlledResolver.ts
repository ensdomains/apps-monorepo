import { type Signer, waitForTransaction } from '@ens-apps/transaction-manager'
import { parseInput } from '@ensdomains/ensjs/utils'
import type { Address, PublicClient } from 'viem'
import { ensureOwnedPermResViaSigner } from '@/features/migration/service/ensureOwnedPermRes'
import { changeResolver } from './changeResolver'

export interface EnsureControlledResolverParams {
  /** ENS name, with or without the `.eth` suffix */
  name: string
  signer: Signer
  /**
   * The account that owns the name and writes its records — the EOA for EOA
   * signers, the smart account for Rhinestone signers. Used as `from`, as the
   * resolver's admin, and as the CREATE2 deployer key.
   */
  accountAddress: Address
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
 * The EOA path: deploy + `setResolver` run as two direct transactions through
 * the transaction manager. Smart accounts don't use this — they bundle deploy +
 * `setResolver` + record write into one sponsored intent (see
 * `setupControlledResolver`).
 *
 * Only supports direct `.eth` 2LDs: `changeResolver` derives the tokenId from
 * the leaf label against the root `.eth` registry. Subnames live in a parent
 * registry the manager can't deploy or point at, so this throws for them —
 * before deploying anything — rather than submitting a reverting `setResolver`.
 *
 * Resolves with the resolver address once `setResolver` is confirmed, so
 * callers can write records to it immediately.
 */
export async function ensureControlledResolver(
  params: EnsureControlledResolverParams,
): Promise<Address> {
  const { name, signer, accountAddress, publicClient, chainId } = params

  const fullName = name.endsWith('.eth') ? name : `${name}.eth`
  if (!parseInput(fullName).is2LD) {
    throw new Error(
      'This subname needs a resolver you control, which can’t be set up here. Set one up for it in the ENS app first.',
    )
  }

  const resolver = await ensureOwnedPermResViaSigner({
    account: accountAddress,
    signer,
    chainId,
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
