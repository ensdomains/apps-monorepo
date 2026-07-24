import {
  type Call,
  getSmartAccountAddress,
  type RhinestoneSigner,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { parseInput } from '@ensdomains/ensjs/utils'
import type { Address, PublicClient } from 'viem'
import {
  buildDeployOwnedPermResCall,
  findExistingPermRes,
  simulateOwnedPermResAddress,
} from '@/features/migration/service/ensureOwnedPermRes'
import { buildSetResolverCall } from './changeResolver'
import {
  buildRecordsUpdateCalls,
  type ServiceRecordSnapshot,
} from './profileRecordTransactions'

export interface SetupControlledResolverParams {
  /** ENS name, with or without the `.eth` suffix */
  name: string
  signer: RhinestoneSigner
  publicClient: PublicClient
  chainId: number
  /** Record diff to write to the freshly-controlled resolver. */
  before: ServiceRecordSnapshot
  after: ServiceRecordSnapshot
}

/**
 * Give the connected owner a resolver they control on a transferred `name`,
 * point the name at it, and write the initial records — one sponsored atomic
 * intent: deploy the owned resolver (skipped when it already exists),
 * `setResolver`, record write. The owned resolver's address is deterministic
 * (CREATE2 keyed off the smart account), so it's predicted up front and the
 * later calls point at it before it's mined.
 *
 * Only supports `.eth` 2LDs — subnames live in a parent registry we can't
 * deploy or point at, so this throws for them before submitting anything.
 *
 * Resolves with the resolver address once the intent is confirmed.
 */
export async function setupControlledResolver(
  params: SetupControlledResolverParams,
): Promise<Address> {
  const { name, signer, publicClient, chainId, before, after } = params

  const fullName = name.endsWith('.eth') ? name : `${name}.eth`
  if (!parseInput(fullName).is2LD) {
    throw new Error(
      'This subname needs a resolver you control, which can’t be set up here. Set one up for it in the ENS app first.',
    )
  }

  const account = getSmartAccountAddress(signer)

  // Only look up the owned resolver once: when it doesn't exist yet, simulate
  // the deterministic deploy address directly instead of going through
  // predictOwnedPermResAddress, which would repeat the same lookup.
  const existing = await findExistingPermRes({ eoa: account, publicClient })
  const resolver =
    existing ??
    (await simulateOwnedPermResAddress({ eoa: account, publicClient }))

  const recordUpdate = await buildRecordsUpdateCalls({
    name,
    before,
    after,
    publicClient,
    resolverAddress: resolver,
  })

  const calls: Call[] = [
    ...(existing ? [] : [buildDeployOwnedPermResCall(account)]),
    buildSetResolverCall({ name, newResolver: resolver }),
    ...recordUpdate.calls,
  ]

  const request: TransactionRequest = {
    type: 'rhinestone-intent',
    from: account,
    chainId,
    rhinestoneParams: { calls, sponsored: true },
  }

  const txId = transactionManager.startTransaction(
    { type: 'custom', request },
    signer,
    {
      description: `Set up ${name} as your primary name`,
      publicClient,
      chainId,
      operation: 'setup-controlled-resolver',
      name,
    },
  )
  await waitForTransaction(txId)

  return resolver
}
