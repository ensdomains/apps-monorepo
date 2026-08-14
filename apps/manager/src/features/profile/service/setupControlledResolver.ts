import {
  type Call,
  type EOATransactionRequest,
  getSmartAccountAddress,
  type RhinestoneSigner,
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  type Address,
  isAddressEqual,
  type PublicClient,
  type WalletClient,
} from 'viem'
import {
  buildDeployOwnedPermResCall,
  findExistingPermRes,
  simulateOwnedPermResAddress,
} from '@/features/migration/service/ensureOwnedPermRes'
import {
  buildSetResolverCall,
  resolveNameRegistryTarget,
} from './changeResolver'
import {
  buildRecordsUpdateCalls,
  type ServiceRecordSnapshot,
} from './profileRecordTransactions'

export interface SetupControlledResolverParams {
  /** ENS name, with or without the `.eth` suffix */
  name: string
  signer: RhinestoneSigner
  ownerAddress: Address
  publicClient: PublicClient
  chainId: number
  /** Connected owner wallet; required when setting up a subname. */
  walletClient?: WalletClient | null
  /**
   * Record diff to write to the freshly-controlled resolver. A freshly
   * deployed/assigned resolver starts empty, so callers typically pass an
   * empty `before` and the desired final records as `after`. When both are
   * empty the record-write step is omitted (deploy + setResolver only).
   */
  before: ServiceRecordSnapshot
  after: ServiceRecordSnapshot
  /** Transaction-manager description. Defaults to a generic setup label. */
  description?: string
}

/**
 * Give the connected owner a resolver they control on a transferred `name`,
 * point the name at it, and optionally write records. The 2LD path uses one
 * atomic HCA intent. The subname path sends the same deploy (when needed),
 * `setResolver`, and record-write calls sequentially from the owner EOA. The
 * owned resolver's address is deterministic (CREATE2 keyed off the owner's
 * salt and the executing account), so it is predicted before submission.
 *
 * Subnames are updated through their attached parent registry. Unlike the 2LD
 * path, those calls cannot use the session validator's fixed target allowlist,
 * so they are submitted sequentially by the owner EOA.
 *
 * Resolves with the resolver address once every required transaction confirms.
 */
export async function setupControlledResolver({
  name,
  signer,
  ownerAddress,
  publicClient,
  chainId,
  walletClient,
  before,
  after,
  description = `Set up resolver for ${name}`,
}: SetupControlledResolverParams): Promise<Address> {
  const smartAccount = getSmartAccountAddress(signer)
  const registryTarget = await resolveNameRegistryTarget({
    name,
    publicClient,
  })

  const existing = await findExistingPermRes({
    eoa: ownerAddress,
    deployer: smartAccount,
    publicClient,
  })
  const resolver =
    existing ??
    (await simulateOwnedPermResAddress({
      eoa: ownerAddress,
      deployer: registryTarget.isSubname ? ownerAddress : smartAccount,
      publicClient,
    }))

  const hasRecordsToWrite =
    before.texts.length > 0 ||
    before.coins.length > 0 ||
    Boolean(before.contentHash?.trim()) ||
    Boolean(before.abi?.trim()) ||
    after.texts.length > 0 ||
    after.coins.length > 0 ||
    Boolean(after.contentHash?.trim()) ||
    Boolean(after.abi?.trim())

  const recordCalls = hasRecordsToWrite
    ? (
        await buildRecordsUpdateCalls({
          name,
          before,
          after,
          publicClient,
          resolverAddress: resolver,
        })
      ).calls
    : []

  const calls: Call[] = [
    ...(existing ? [] : [buildDeployOwnedPermResCall(ownerAddress)]),
    buildSetResolverCall({
      label: registryTarget.label,
      newResolver: resolver,
      registryAddress: registryTarget.registryAddress,
    }),
    ...recordCalls,
  ]

  if (registryTarget.isSubname) {
    if (
      !walletClient?.account ||
      !isAddressEqual(walletClient.account.address, ownerAddress)
    ) {
      throw new Error(
        'Cannot set up subname resolver - the connected wallet does not control the owner address.',
      )
    }

    const eoaSigner: Signer = { type: 'eoa', walletClient }

    for (const call of calls) {
      const request: EOATransactionRequest = {
        type: 'eoa',
        from: ownerAddress,
        to: call.to,
        data: call.data,
        value: call.value,
        chainId,
      }
      const txId = transactionManager.startTransaction(
        { type: 'custom', request },
        eoaSigner,
        {
          description,
          publicClient,
          chainId,
          operation: 'setup-controlled-resolver',
          name,
        },
      )
      await waitForTransaction(txId)
    }

    return resolver
  }

  const request: TransactionRequest = {
    type: 'rhinestone-intent',
    from: smartAccount,
    chainId,
    // User-paid in USDC out of the HCA's own balance; this deployment offers
    // no gas sponsorship. See `signer.types.ts`.
    rhinestoneParams: { calls, feeAsset: 'USDC' },
  }

  const txId = transactionManager.startTransaction(
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
  await waitForTransaction(txId)

  return resolver
}
