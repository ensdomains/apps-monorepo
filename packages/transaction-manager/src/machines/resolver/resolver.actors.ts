import { fromPromise, type ResultAsync } from 'neverthrow'
import { type Address, encodeFunctionData, type PublicClient } from 'viem'
import { readContract } from 'viem/actions'
import { ETH_REGISTRY_ABI } from '../../contracts/abis/ETHRegistry.abi'
import { ENS_SEPOLIA_CONTRACTS } from '../../contracts/ens-sepolia'
import { getSmartAccountAddress } from '../../helpers/getSmartAccountAddress'
import { transactionManager } from '../../providers/transactionManager'

function createTransactionRequest(params: {
  signer: import('../..').Signer
  from: Address
  to: Address
  data: `0x${string}`
  value: bigint
  chainId: number
  calls: Array<{ to: Address; data: `0x${string}`; value: bigint }>
}):
  | {
      type: 'eoa'
      from: Address
      to: Address
      data: `0x${string}`
      value: bigint
      chainId: number
    }
  | {
      type: 'rhinestone-intent'
      from: Address
      to: Address
      data: `0x${string}`
      value: bigint
      chainId: number
      rhinestoneParams: {
        calls: Array<{ to: Address; data: `0x${string}`; value: bigint }>
        sponsored: boolean
      }
    }
  | {
      type: 'pimlico'
      from: Address
      to: Address
      data: `0x${string}`
      value: bigint
      chainId: number
      pimlicoParams: {
        calls: Array<{ to: Address; data: `0x${string}`; value: bigint }>
        sponsored: boolean
      }
    }
  | {
      type: 'kernel'
      from: Address
      to: Address
      data: `0x${string}`
      value: bigint
      chainId: number
      kernelParams: {
        calls: Array<{ to: Address; data: `0x${string}`; value: bigint }>
        sponsored: boolean
      }
    } {
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
      },
    }
  }

  if (signer.type === 'pimlico') {
    return {
      type: 'pimlico',
      from,
      to,
      data,
      value,
      chainId,
      pimlicoParams: {
        calls,
        sponsored: true,
      },
    }
  }

  if (signer.type === 'kernel') {
    return {
      type: 'kernel',
      from,
      to,
      data,
      value,
      chainId,
      kernelParams: {
        calls,
        sponsored: true,
      },
    }
  }

  throw new Error(`Unsupported signer type for resolver update: ${signer.type}`)
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

      const [tokenId] = (await readContract(input.publicClient, {
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
