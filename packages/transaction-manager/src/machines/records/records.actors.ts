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
import type { TransactionRequest } from '../../types/transaction.types'
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

      const node = namehash(input.name) as Hex
      const calls = buildDedicatedResolverCalls(changes)

      const multicallData = encodeFunctionData({
        abi: DEDICATED_RESOLVER_ABI,
        functionName: 'multicallWithNodeCheck',
        args: [node, calls],
      })

      const fromAddress =
        input.signer.type === 'rhinestone' || input.signer.type === 'pimlico'
          ? getSmartAccountAddress(input.signer)
          : input.accountAddress

      let request: TransactionRequest

      if (
        input.signer.type === 'rhinestone' ||
        input.signer.type === 'pimlico'
      ) {
        request = {
          type: 'rhinestone-intent',
          from: fromAddress,
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
        }
      } else if (input.signer.type === 'eoa') {
        request = {
          type: 'eoa',
          from: fromAddress,
          to: resolverAddress,
          data: multicallData,
          value: 0n,
          chainId: input.chainId,
        }
      } else {
        throw new Error(
          'Only Smart Account, or EOA signers are supported for profile updates',
        )
      }

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
