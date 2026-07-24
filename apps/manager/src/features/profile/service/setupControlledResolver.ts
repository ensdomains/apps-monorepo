import {
  type Call,
  getSmartAccountAddress,
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { parseInput } from '@ensdomains/ensjs/utils'
import type { Address, PublicClient } from 'viem'
import {
  buildDeployOwnedPermResCall,
  ensureOwnedPermResViaSigner,
  findExistingPermRes,
  simulateOwnedPermResAddress,
} from '@/features/migration/service/ensureOwnedPermRes'
import { buildSetResolverCall, changeResolver } from './changeResolver'
import {
  buildRecordsUpdateCalls,
  type ServiceRecordSnapshot,
  saveRecords,
} from './profileRecordTransactions'

export interface SetupControlledResolverParams {
  /** ENS name, with or without the `.eth` suffix */
  name: string
  signer: Signer
  /**
   * The account that owns the name and writes its records — the EOA for EOA
   * signers, the smart account for Rhinestone signers.
   */
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
  /** Record diff to write to the freshly-controlled resolver. */
  before: ServiceRecordSnapshot
  after: ServiceRecordSnapshot
}

/**
 * Give the connected owner a resolver they control on a transferred `name`,
 * point the name at it, and write the initial records — all in one go.
 *
 * For smart accounts the three steps (deploy the owned resolver, `setResolver`,
 * write records) are bundled into a single gas-sponsored intent, so setup is
 * one atomic confirmation with no native-ETH dependency. EOAs, which can't
 * batch, run the same three steps as a short sequence of direct transactions.
 *
 * Only supports `.eth` 2LDs — subnames live in a parent registry we can't
 * deploy or point at, so this throws for them before submitting anything.
 *
 * Resolves with the resolver address once the setup is confirmed.
 */
export async function setupControlledResolver(
  params: SetupControlledResolverParams,
): Promise<Address> {
  const { name, signer, accountAddress, publicClient, chainId, before, after } =
    params

  const fullName = name.endsWith('.eth') ? name : `${name}.eth`
  if (!parseInput(fullName).is2LD) {
    throw new Error(
      'This subname needs a resolver you control, which can’t be set up here. Set one up for it in the ENS app first.',
    )
  }

  if (signer.type === 'rhinestone') {
    return setupViaBundle({
      account: getSmartAccountAddress(signer),
      signer,
      name,
      chainId,
      publicClient,
      before,
      after,
    })
  }

  const resolver = await ensureOwnedPermResViaSigner({
    account: accountAddress,
    signer,
    chainId,
    publicClient,
  })
  await waitForTransaction(
    changeResolver({
      name,
      newResolver: resolver,
      signer,
      accountAddress,
      publicClient,
      chainId,
    }),
  )
  await saveRecords({
    name,
    before,
    after,
    signer,
    accountAddress,
    publicClient,
    chainId,
    resolverAddress: resolver,
  })
  return resolver
}

/**
 * Smart-account path: assemble deploy (skipped when the resolver already
 * exists) + `setResolver` + record write into one sponsored intent. The owned
 * resolver's address is deterministic (CREATE2 keyed off the smart account), so
 * we predict it up front and point `setResolver`/the record write at it before
 * it's mined.
 */
async function setupViaBundle(params: {
  account: Address
  signer: Signer
  name: string
  chainId: number
  publicClient: PublicClient
  before: ServiceRecordSnapshot
  after: ServiceRecordSnapshot
}): Promise<Address> {
  const { account, signer, name, chainId, publicClient, before, after } = params

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
