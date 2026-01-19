import { ResultAsync } from 'neverthrow'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  namehash,
  type PublicClient,
} from 'viem'
import type { Signer } from '../..'
import { DEDICATED_RESOLVER_ABI } from '../../contracts/abis/DedicatedResolver.abi'
import { ENS_SEPOLIA_CONTRACTS } from '../../contracts/ens-sepolia'
import { getSmartAccountAddress } from '../../helpers/getSmartAccountAddress'
import { transactionManager } from '../../providers/transactionManager'
import type {
  RhinestoneTransactionRequest,
  TransactionRequest,
  ZeroDevTransactionRequest,
} from '../../types/transaction.types'
import {
  buildDedicatedResolverCalls,
  computeRecordChanges,
} from './records.helpers'
import type { ServiceRecordSnapshot } from './records.types'

function createTransactionRequest(params: {
  signer: Signer
  from: Address
  to: Address
  data: Hex
  value: bigint
  chainId: number
  calls: Array<{ to: Address; data: Hex; value: bigint }>
  sponsored?: boolean
}): TransactionRequest {
  const { signer, from, to, data, value, chainId, calls, sponsored } = params

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
        sponsored: sponsored ?? true,
      },
    } as RhinestoneTransactionRequest
  }

  if (signer.type === 'zerodev') {
    return {
      type: 'zerodev',
      from,
      to,
      data,
      value,
      chainId,
      zerodevParams: {
        calls,
        sponsored: sponsored ?? true,
      },
    } as ZeroDevTransactionRequest
  }

  throw new Error(
    `Unsupported signer type for transaction request: ${signer.type}`,
  )
}

export const submitProfileRecordsUpdateActor = (input: {
  name: string
  before: ServiceRecordSnapshot
  after: ServiceRecordSnapshot
  signer: Signer
  publicClient: PublicClient
  chainId: number
  accountAddress: Address
  resolverAddress?: Address
}): ResultAsync<string, Error> =>
  ResultAsync.fromSafePromise(
    Promise.resolve().then(() => {
      const changes = computeRecordChanges(input.before, input.after)

      if (changes.texts.length === 0 && changes.coins.length === 0) {
        throw new Error('No profile record changes to apply')
      }

      let fromAddress: Address

      if (input.signer.type === 'eoa') {
        fromAddress = input.accountAddress
      } else if (
        input.signer.type === 'rhinestone' ||
        input.signer.type === 'zerodev'
      ) {
        fromAddress = getSmartAccountAddress(input.signer)
      } else {
        throw new Error(
          'Only EOA, Rhinestone, or ZeroDev signers are supported for profile updates',
        )
      }

      const resolverAddress =
        input.resolverAddress ?? ENS_SEPOLIA_CONTRACTS.PublicResolver

      const node = namehash(input.name) as Hex
      const calls = buildDedicatedResolverCalls(changes)

      const multicallData = encodeFunctionData({
        abi: DEDICATED_RESOLVER_ABI,
        functionName: 'multicallWithNodeCheck',
        args: [node, calls],
      })

      const request = createTransactionRequest({
        signer: input.signer,
        from: fromAddress,
        to: resolverAddress,
        data: multicallData,
        value: 0n,
        chainId: input.chainId,
        calls: [
          {
            to: resolverAddress,
            data: multicallData,
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
          description: `Update profile records for ${input.name}`,
          publicClient: input.publicClient,
          chainId: input.chainId,
        },
      )

      return txId
    }),
  ).mapErr((error) => error as Error)
