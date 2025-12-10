import { fromPromise, type ResultAsync } from 'neverthrow'
import { type Address, encodeFunctionData, type PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { ETH_REGISTRY_ABI } from '../../contracts/abis/ETHRegistry.abi'
import { ENS_SEPOLIA_CONTRACTS } from '../../contracts/ens-sepolia'
import { getSmartAccountAddress } from '../../helpers/getSmartAccountAddress'
import { transactionManager } from '../../providers/transactionManager'
import type { TransactionRequest } from '../../types/transaction.types'

export function submitResolverUpdateActor(input: {
  name: string
  newResolver: Address
  signer: import('../..').Signer
  publicClient: PublicClient
  accountAddress: Address
}): ResultAsync<string, Error> {
  return fromPromise(
    (async () => {
      const cleanName = input.name.replace('.eth', '')

      const [tokenId] = (await input.publicClient.readContract({
        address: ENS_SEPOLIA_CONTRACTS.ETHRegistry,
        abi: ETH_REGISTRY_ABI,
        functionName: 'getNameData',
        args: [cleanName],
      })) as [bigint, unknown]

      const data = encodeFunctionData({
        abi: ETH_REGISTRY_ABI,
        functionName: 'setResolver',
        args: [tokenId, input.newResolver],
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
          to: ENS_SEPOLIA_CONTRACTS.ETHRegistry,
          data,
          value: 0n,
          chainId: sepolia.id,
          rhinestoneParams: {
            calls: [
              {
                to: ENS_SEPOLIA_CONTRACTS.ETHRegistry,
                data,
                value: 0n,
              },
            ],
          },
        }
      } else if (input.signer.type === 'eoa') {
        request = {
          type: 'eoa',
          from: fromAddress,
          to: ENS_SEPOLIA_CONTRACTS.ETHRegistry,
          data,
          value: 0n,
          chainId: sepolia.id,
        }
      } else {
        throw new Error(
          'Only Smart Account, or EOA signers are supported for resolver updates',
        )
      }

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request,
        },
        input.signer,
        {
          description: `Update resolver for ${input.name}.eth`,
          publicClient: input.publicClient,
          chainId: sepolia.id,
        },
      )

      return txId
    })(),
    (error) => error as Error,
  )
}
