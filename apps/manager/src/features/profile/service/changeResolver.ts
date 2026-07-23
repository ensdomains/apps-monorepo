import {
  type Call,
  ENS_SEPOLIA_CONTRACTS,
  getSmartAccountAddress,
  type Signer,
  type TransactionRequest,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { permissionedRegistrySetResolverSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import {
  type Address,
  encodeFunctionData,
  labelhash,
  type PublicClient,
} from 'viem'

/** Strip a trailing `.eth` so a name and its bare label normalize alike. */
const toLabel = (name: string): string => name.replace('.eth', '')

/**
 * Build the `setResolver` call for a V2 name, without submitting it.
 *
 * The permissioned registry derives the tokenId from the leaf labelhash, so no
 * on-chain lookup is needed — which lets callers batch this alongside other
 * calls (e.g. deploy + setResolver + record write) in a single intent.
 */
export function buildSetResolverCall({
  name,
  newResolver,
}: {
  name: string
  newResolver: Address
}): Call {
  const tokenId = BigInt(labelhash(toLabel(name)))

  const data = encodeFunctionData({
    abi: permissionedRegistrySetResolverSnippet,
    functionName: 'setResolver',
    args: [tokenId, newResolver],
  })

  return { to: ENS_SEPOLIA_CONTRACTS.ETHRegistry, data, value: 0n }
}

export interface ChangeResolverParams {
  /** ENS name, with or without the `.eth` suffix */
  name: string
  newResolver: Address
  signer: Signer
  /** EOA / owner address used as `from` for EOA signers */
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
}

/**
 * Set the resolver for an ENS V2 name through the transaction manager.
 *
 * Replaces the former resolverMachine: builds the `setResolver` call, submits
 * it via the singleton, and returns the txId synchronously. Track progress
 * reactively with `useSelector(transactionManager.getTransaction(txId), ...)`.
 */
export function changeResolver(params: ChangeResolverParams): string {
  const { name, newResolver, signer, accountAddress, publicClient, chainId } =
    params

  const from =
    signer.type === 'eoa' ? accountAddress : getSmartAccountAddress(signer)

  const call = buildSetResolverCall({ name, newResolver })

  const request: TransactionRequest =
    signer.type === 'eoa'
      ? { type: 'eoa', from, to: call.to, data: call.data, value: 0n, chainId }
      : {
          type: 'rhinestone-intent',
          from,
          chainId,
          rhinestoneParams: {
            calls: [call],
            sponsored: true,
          },
        }

  return transactionManager.startTransaction(
    { type: 'custom', request },
    signer,
    {
      description: `Update resolver for ${toLabel(name)}.eth`,
      publicClient,
      chainId,
      operation: 'set-resolver',
      name,
    },
  )
}
