import {
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

  const cleanName = name.replace('.eth', '')
  // V2 permissioned registry derives the tokenId from labelhash directly,
  // so no on-chain lookup is needed.
  const tokenId = BigInt(labelhash(cleanName))

  const data = encodeFunctionData({
    abi: permissionedRegistrySetResolverSnippet,
    functionName: 'setResolver',
    args: [tokenId, newResolver],
  })

  const to = ENS_SEPOLIA_CONTRACTS.ETHRegistry

  const request: TransactionRequest =
    signer.type === 'eoa'
      ? { type: 'eoa', from, to, data, value: 0n, chainId }
      : {
          type: 'rhinestone-intent',
          from,
          to,
          data,
          value: 0n,
          chainId,
          rhinestoneParams: {
            calls: [{ to, data, value: 0n }],
            sponsored: true,
            // ETHRegistry.setResolver is not in the registration-scoped
            // smart-session allowlist; force the SCA's default validator
            // (EOA-owner signature).
            useSession: false,
          },
        }

  return transactionManager.startTransaction(
    { type: 'custom', request },
    signer,
    {
      description: `Update resolver for ${cleanName}.eth`,
      publicClient,
      chainId,
      operation: 'set-resolver',
      name,
    },
  )
}
