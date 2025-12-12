import { fromPromise, type ResultAsync } from 'neverthrow'
import {
  type Account,
  type Address,
  encodeFunctionData,
  type PublicClient,
} from 'viem'
import { sepolia } from 'viem/chains'
import { ETH_REGISTRY_ABI } from '../../contracts/abis/ETHRegistry.abi'
import { ENS_SEPOLIA_CONTRACTS } from '../../contracts/ens-sepolia'
import { getSmartAccountAddress } from '../../helpers/getSmartAccountAddress'
import { transactionManager } from '../../providers/transactionManager'

export function submitResolverUpdateActor(input: {
  name: string
  newResolver: Address
  signer: import('../..').Signer
  publicClient: PublicClient
  eoaAccountSigner: Account
}): ResultAsync<string, Error> {
  return fromPromise(
    (async () => {
      const smartAccountAddress = getSmartAccountAddress(input.signer)
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

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'rhinestone-intent',
            from: smartAccountAddress,
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
          },
        },
        input.signer,
        {
          description: `Update resolver for ${input.name}.eth`,
          publicClient: input.publicClient,
        },
        input.eoaAccountSigner,
      )

      return txId
    })(),
    (error) => error as Error,
  )
}
