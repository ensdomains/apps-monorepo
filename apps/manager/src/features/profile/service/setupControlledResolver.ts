import {
  type Call,
  type EOASigner,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import type { Address, PublicClient } from 'viem'
import {
  buildDeployOwnedPermResCall,
  findExistingPermRes,
  simulateOwnedPermResAddress,
} from '@/features/migration/service/ensureOwnedPermRes'
import { checkMigrationResolverReadiness } from '@/features/migration/service/migrationInvariants'
import { buildSetResolverCall, resolveNameRegistry } from './changeResolver'
import {
  type ServiceRecordSnapshot,
  saveRecords,
} from './profileRecordTransactions'
import { canSetNameResolver } from './setResolverAccess'

export class ResolverChangeNotAuthorizedError extends Error {
  constructor() {
    super('Resolver change not authorized')
    this.name = 'ResolverChangeNotAuthorizedError'
  }
}

export class OwnedResolverNotReadyError extends Error {
  constructor(options?: { readonly cause?: unknown }) {
    super('Owned resolver is not ready', options)
    this.name = 'OwnedResolverNotReadyError'
  }
}

const assertOwnedResolverReady = async ({
  resolver,
  ownerAddress,
  publicClient,
}: {
  readonly resolver: Address
  readonly ownerAddress: Address
  readonly publicClient: PublicClient
}) => {
  const readiness = await checkMigrationResolverReadiness({
    resolver,
    hca: ownerAddress,
    wallet: ownerAddress,
    publicClient,
  }).catch((cause) => {
    throw new OwnedResolverNotReadyError({ cause })
  })

  if (readiness.status !== 'verified' || !readiness.walletHasWildcardRoles) {
    throw new OwnedResolverNotReadyError()
  }
}

const hasRecords = ({
  texts,
  coins,
  contentHash,
  abi,
}: ServiceRecordSnapshot): boolean =>
  texts.length > 0 ||
  coins.length > 0 ||
  Boolean(contentHash?.trim()) ||
  Boolean(abi?.trim())

export interface SetupControlledResolverParams {
  /** ENS name, with or without the `.eth` suffix */
  readonly name: string
  /** Owner EOA signer. Every resolver-setup step is sent by this wallet. */
  readonly signer: EOASigner
  readonly ownerAddress: Address
  readonly publicClient: PublicClient
  readonly chainId: number
  /**
   * Record diff to write to the controlled resolver. The target node is cleared
   * atomically with the diff so a retry cannot expose records from an earlier
   * failed attempt. A fresh resolver with empty snapshots skips the redundant
   * clear, while an existing resolver is always cleared before reuse.
   */
  readonly before: ServiceRecordSnapshot
  readonly after: ServiceRecordSnapshot
  /** Transaction-manager description. Defaults to a generic setup label. */
  readonly description?: string
}

/**
 * Give the connected owner a resolver they control on a transferred `name`,
 * seed the requested records, then point the name at it. Every step is sent by
 * the owner EOA because the V2 registry authorizes `setResolver` against the
 * actual caller. The target node is cleared and seeded before the registry
 * pointer changes so a rejected record transaction cannot leave the live name
 * on an empty resolver, and a retry cannot publish stale attempted values.
 *
 * Works for any name under `.eth`: `setResolver` is sent to whichever V2
 * registry holds the name's leaf label (the `.eth` registry for a 2LD, the
 * parent's registry for a subname). Locating that registry happens first, so a
 * name no V2 registry holds fails before anything is submitted.
 *
 * Resolves with the resolver address once the final transaction is confirmed.
 */
export async function setupControlledResolver({
  name,
  signer,
  ownerAddress,
  publicClient,
  chainId,
  before,
  after,
  description = `Set up resolver for ${name}`,
}: SetupControlledResolverParams): Promise<Address> {
  const fullName = name.endsWith('.eth') ? name : `${name}.eth`
  const location = await resolveNameRegistry(fullName)

  const existing = await findExistingPermRes({
    eoa: ownerAddress,
    publicClient,
  })
  const resolver =
    existing ??
    (await simulateOwnedPermResAddress({
      eoa: ownerAddress,
      publicClient,
    }))

  const setResolverCall = buildSetResolverCall({
    ...location,
    newResolver: resolver,
  })
  const canRepoint = await canSetNameResolver({
    location,
    resolver,
    ownerAddress,
    publicClient,
  })

  if (!canRepoint) {
    throw new ResolverChangeNotAuthorizedError()
  }

  const sendOwnerTransaction = async (call: Call): Promise<void> => {
    const request: TransactionRequest = {
      type: 'eoa',
      from: ownerAddress,
      chainId,
      ...call,
    }

    const transactionId = transactionManager.startTransaction(
      { type: 'custom', request },
      signer,
      {
        description,
        publicClient,
        chainId,
        operation: 'setup-controlled-resolver',
        name,
      },
    )
    await waitForTransaction(transactionId)
  }

  if (!existing) {
    await sendOwnerTransaction(buildDeployOwnedPermResCall(ownerAddress))
  }

  await assertOwnedResolverReady({ resolver, ownerAddress, publicClient })

  if (existing || hasRecords(before) || hasRecords(after)) {
    await saveRecords({
      name,
      before,
      after,
      shouldClearRecords: true,
      signer,
      accountAddress: ownerAddress,
      publicClient,
      chainId,
      resolverAddress: resolver,
    })
  }

  const canStillRepoint = await canSetNameResolver({
    location,
    resolver,
    ownerAddress,
    publicClient,
  })
  if (!canStillRepoint) {
    throw new ResolverChangeNotAuthorizedError()
  }

  await sendOwnerTransaction(setResolverCall)

  return resolver
}
