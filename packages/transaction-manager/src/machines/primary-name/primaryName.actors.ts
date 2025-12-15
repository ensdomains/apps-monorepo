import { fromPromise, type ResultAsync } from 'neverthrow'
import { encodeFunctionData, type PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { DEFAULT_REVERSE_REGISTRAR_ABI } from '../../contracts/abis/DefaultReverseRegistrar.abi'
import { ENS_SEPOLIA_CONTRACTS } from '../../contracts/ens-sepolia'
import { getSmartAccountAddress } from '../../helpers/getSmartAccountAddress'
import { transactionManager } from '../../providers/transactionManager'

export function submitPrimaryNameUpdateActor(input: {
  name: string
  signer: import('../..').Signer
  publicClient: PublicClient
}): ResultAsync<string, Error> {
  return fromPromise(
    (async () => {
      const smartAccountAddress = getSmartAccountAddress(input.signer)
      const registrarAddress = ENS_SEPOLIA_CONTRACTS.DefaultReverseRegistrar

      const cleanName = input.name.endsWith('.eth')
        ? input.name
        : `${input.name}.eth`

      const data = encodeFunctionData({
        abi: DEFAULT_REVERSE_REGISTRAR_ABI,
        functionName: 'setName',
        args: [cleanName],
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'rhinestone-intent',
            from: smartAccountAddress,
            to: registrarAddress,
            data,
            value: 0n,
            chainId: sepolia.id,
            rhinestoneParams: {
              calls: [
                {
                  to: registrarAddress,
                  data,
                  value: 0n,
                },
              ],
            },
          },
        },
        input.signer,
        {
          description: `Set primary name to ${cleanName}`,
          publicClient: input.publicClient,
        },
      )

      return txId
    })(),
    (error) => error as Error,
  )
}
