import {
  type Call,
  ENS_SEPOLIA_CONTRACTS,
  getSmartAccountAddress,
  type Signer,
  type TransactionRequest,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { setResolverWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import { type Address, encodeFunctionData, type PublicClient } from 'viem'

/** Strip a trailing `.eth` so a name and its bare label normalize alike. */
const toLabel = (name: string): string => name.replace('.eth', '')

export function buildSetResolverCall({
  name,
  newResolver,
}: {
  name: string
  newResolver: Address
}): Call {
  const writeParams = setResolverWriteParameters(
    {} as Parameters<typeof setResolverWriteParameters>[0],
    {
      label: toLabel(name),
      registryAddress: ENS_SEPOLIA_CONTRACTS.ETHRegistry,
      resolverAddress: newResolver,
    },
  )

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  })

  return { to: writeParams.address, data, value: 0n }
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
