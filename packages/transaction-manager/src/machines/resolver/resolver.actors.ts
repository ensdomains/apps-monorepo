import { permissionedRegistrySetResolverSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, type ResultAsync } from 'neverthrow'
import {
  type Address,
  encodeFunctionData,
  labelhash,
  type PublicClient,
} from 'viem'
import { ENS_SEPOLIA_CONTRACTS } from '../../contracts/ens-sepolia'
import { getSmartAccountAddress } from '../../helpers/getSmartAccountAddress'
import { transactionManager } from '../../providers/transactionManager'
import type { Call, TransactionRequest } from '../../types/transaction.types'

function createTransactionRequest(params: {
  signer: import('../..').Signer
  from: Address
  chainId: number
  calls: Call[]
}): TransactionRequest {
  const { signer, chainId, from, calls } = params

  if (calls.length === 0) {
    throw new Error('createTransactionRequest requires at least one call')
  }

  if (signer.type === 'eoa') {
    if (calls.length > 1) {
      throw new Error(
        'EOA transaction requests support a single call; received a batch.',
      )
    }
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    const call = calls[0]!
    return {
      type: 'eoa',
      from,
      to: call.to,
      data: call.data,
      value: call.value,
      chainId,
    }
  }

  if (signer.type === 'rhinestone') {
    return {
      type: 'rhinestone-intent',
      from,
      chainId,
      rhinestoneParams: {
        calls,
        sponsored: true,
      },
    }
  }

  signer satisfies never
  throw new Error('Unsupported signer type for resolver update')
}

export function submitResolverUpdateActor(input: {
  name: string
  newResolver: Address
  signer: import('../..').Signer
  publicClient: PublicClient
  accountAddress: Address
  chainId: number
}): ResultAsync<string, Error> {
  return fromPromise(
    (async () => {
      const fromAddress =
        input.signer.type === 'eoa'
          ? input.accountAddress
          : getSmartAccountAddress(input.signer)
      const cleanName = input.name.replace('.eth', '')

      // V2 permissioned registry derives tokenId from labelhash directly,
      // so no on-chain lookup is needed.
      const tokenId = BigInt(labelhash(cleanName))

      const data = encodeFunctionData({
        abi: permissionedRegistrySetResolverSnippet,
        functionName: 'setResolver',
        args: [tokenId, input.newResolver],
      })

      const request = createTransactionRequest({
        signer: input.signer,
        from: fromAddress,
        chainId: input.chainId,
        calls: [
          {
            to: ENS_SEPOLIA_CONTRACTS.ETHRegistry,
            data,
            value: 0n,
          },
        ],
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request,
        },
        input.signer,
        {
          description: `Update resolver for ${input.name}.eth`,
          publicClient: input.publicClient,
        },
      )

      return txId
    })(),
    (error) => error as Error,
  )
}
