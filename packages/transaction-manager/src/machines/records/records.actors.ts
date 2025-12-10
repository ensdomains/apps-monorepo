import { fromPromise, type ResultAsync } from 'neverthrow'
import { type Address, encodeFunctionData, type PublicClient } from 'viem'
import { DEDICATED_RESOLVER_ABI } from '../../contracts/abis/DedicatedResolver.abi'
import { ENS_SEPOLIA_CONTRACTS } from '../../contracts/ens-sepolia'
import { buildTransactionRequest } from '../../helpers/buildTransactionRequest'
import { transactionManager } from '../../providers/transactionManager'
import {
  buildDedicatedResolverCalls,
  computeRecordChanges,
} from './records.helpers'
import type { ServiceRecordSnapshot } from './records.types'

export const submitProfileRecordsUpdateActor = (input: {
  name: string
  before: ServiceRecordSnapshot
  after: ServiceRecordSnapshot
  signer: import('../..').Signer
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
  resolverAddress?: Address
}): ResultAsync<string, Error> =>
  fromPromise(
    (async () => {
      const changes = computeRecordChanges(input.before, input.after)

      if (changes.texts.length === 0 && changes.coins.length === 0) {
        throw new Error('No profile record changes to apply')
      }

      const resolverAddress =
        input.resolverAddress ?? ENS_SEPOLIA_CONTRACTS.PublicResolver

      const calls = buildDedicatedResolverCalls(changes)

      const multicallData = encodeFunctionData({
        abi: DEDICATED_RESOLVER_ABI,
        functionName: 'multicall',
        args: [calls],
      })

      const request = buildTransactionRequest({
        signer: input.signer,
        to: resolverAddress,
        data: multicallData,
        value: 0n,
        chainId: input.chainId,
        accountAddress: input.accountAddress,
        rhinestoneCalls: [
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
    })(),
    (error) => error as Error,
  )
