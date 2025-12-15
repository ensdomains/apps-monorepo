import { fromPromise, type ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { encodeFunctionData, type PublicClient } from 'viem'
import { DEFAULT_REVERSE_REGISTRAR_ABI } from '../../contracts/abis/DefaultReverseRegistrar.abi'
import { ENS_SEPOLIA_CONTRACTS } from '../../contracts/ens-sepolia'
import { getSmartAccountAddress } from '../../helpers/getSmartAccountAddress'
import { transactionManager } from '../../providers/transactionManager'

export function submitPrimaryNameUpdateActor(input: {
  name: string
  signer: import('../..').Signer
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
}): ResultAsync<string, Error> {
  return fromPromise(
    (async () => {
      const registrarAddress = ENS_SEPOLIA_CONTRACTS.DefaultReverseRegistrar

      const cleanName = input.name.endsWith('.eth')
        ? input.name
        : `${input.name}.eth`

      const data = encodeFunctionData({
        abi: DEFAULT_REVERSE_REGISTRAR_ABI,
        functionName: 'setName',
        args: [cleanName],
      })

      let fromAddress: Address
      let request: any

      if (input.signer.type === 'eoa') {
        fromAddress = input.accountAddress

        request = {
          type: 'eoa' as const,
          from: fromAddress,
          to: registrarAddress,
          data,
          value: 0n,
          chainId: input.chainId,
        }
      } else {
        const smartAccountAddress = getSmartAccountAddress(input.signer)
        fromAddress = smartAccountAddress

        if (input.signer.type === 'rhinestone') {
          request = {
            type: 'rhinestone-intent' as const,
            from: fromAddress,
            to: registrarAddress,
            data,
            value: 0n,
            chainId: input.chainId,
            rhinestoneParams: {
              calls: [
                {
                  to: registrarAddress,
                  data,
                  value: 0n,
                },
              ],
              sponsored: true,
            },
          }
        } else if (input.signer.type === 'pimlico') {
          request = {
            type: 'pimlico' as const,
            from: fromAddress,
            to: registrarAddress,
            data,
            value: 0n,
            chainId: input.chainId,
            pimlicoParams: {
              calls: [
                {
                  to: registrarAddress,
                  data,
                  value: 0n,
                },
              ],
              sponsored: true,
            },
          }
        } else {
          throw new Error(
            `Unsupported signer type for primary name update: ${input.signer.type}`,
          )
        }
      }

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request,
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
