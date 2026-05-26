import { permissionedRegistrySetResolverSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, type ResultAsync } from 'neverthrow'
import {
  type Address,
  encodeFunctionData,
  type Hex,
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
  to: Address
  data: Hex
  value: bigint
  chainId: number
  calls: Call[]
}): TransactionRequest {
  const { signer, chainId, from, to, data, value, calls } = params

  if (signer.type === 'eoa') {
    return {
      type: 'eoa',
      from,
      to,
      data,
      value,
      chainId,
    }
  }

  if (signer.type === 'rhinestone') {
    return {
      type: 'rhinestone-intent',
      from,
      to,
      data,
      value,
      chainId,
      rhinestoneParams: {
        calls,
        sponsored: true,
        // ETHRegistry.setResolver is not in the registration-scoped smart-
        // session allowlist (see build-registration-session.ts). Force the
        // SDK to use the SCA's default validator (EOA-owner signature).
        useSession: false,
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
        to: ENS_SEPOLIA_CONTRACTS.ETHRegistry,
        data,
        value: 0n,
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
