import { fromPromise, type ResultAsync } from 'neverthrow'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  namehash,
  type PublicClient,
} from 'viem'
import { DEDICATED_RESOLVER_ABI } from '../../contracts/abis/DedicatedResolver.abi'
import { ENS_SEPOLIA_CONTRACTS } from '../../contracts/ens-sepolia'
import { getSmartAccountAddress } from '../../helpers/getSmartAccountAddress'
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

      if (input.signer.type !== 'rhinestone') {
        throw new Error(
          'Only Rhinestone signer is currently supported for profile updates',
        )
      }

      const smartAccountAddress = getSmartAccountAddress(input.signer)
      const resolverAddress =
        input.resolverAddress ?? ENS_SEPOLIA_CONTRACTS.PublicResolver

      const node = namehash(input.name) as Hex
      const calls = buildDedicatedResolverCalls(changes)

      const multicallData = encodeFunctionData({
        abi: DEDICATED_RESOLVER_ABI,
        functionName: 'multicallWithNodeCheck',
        args: [node, calls],
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'rhinestone-intent',
            from: smartAccountAddress,
            to: resolverAddress,
            data: multicallData,
            value: 0n,
            chainId: input.chainId,
            rhinestoneParams: {
              calls: [
                {
                  to: resolverAddress,
                  data: multicallData,
                  value: 0n,
                },
              ],
            },
          },
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
