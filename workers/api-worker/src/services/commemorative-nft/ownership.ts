import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  getAddress,
  type PublicClient,
} from 'viem'
import { createEnsClient } from '#core/eth/client.js'

const ownerOfAbi = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export type TokenOwnershipStatus = 'minted' | 'unminted' | 'unavailable'

export interface TokenOwnershipReader {
  getStatus(tokenId: string): Promise<TokenOwnershipStatus>
}

const isContractRevert = (error: unknown): boolean => {
  if (!(error instanceof BaseError)) return false

  return (
    error.walk(
      (candidate) => candidate instanceof ContractFunctionRevertedError,
    ) instanceof ContractFunctionRevertedError
  )
}

export const readCommemorativeNftOwnership = async (
  client: PublicClient,
  contractAddress: Address,
  tokenId: string,
): Promise<TokenOwnershipStatus> => {
  try {
    await client.readContract({
      abi: ownerOfAbi,
      address: contractAddress,
      args: [BigInt(tokenId)],
      functionName: 'ownerOf',
    })
    return 'minted'
  } catch (error) {
    return isContractRevert(error) ? 'unminted' : 'unavailable'
  }
}

export const createSepoliaTokenOwnershipReader = (
  env: CloudflareBindings,
): TokenOwnershipReader => ({
  getStatus: async (tokenId) => {
    const client = createEnsClient(env)
    if (client.isErr()) return 'unavailable'

    return readCommemorativeNftOwnership(
      client.value,
      getAddress(env.COMMEMORATIVE_NFT_CONTRACT_ADDRESS),
      tokenId,
    )
  },
})
