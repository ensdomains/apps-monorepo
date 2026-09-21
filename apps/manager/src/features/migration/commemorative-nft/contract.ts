import {
  getPublicClient,
  getTransaction,
  readContract,
  type Config as WagmiConfig,
  writeContract,
} from '@wagmi/core'
import {
  type Address,
  encodeFunctionData,
  getAddress,
  type Hex,
  parseAbi,
} from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { withRequestDeadline } from '../service/requestDeadline'
import { getCommemorativeNftContractAddress } from './config'
import type { PendingNftClaim } from './pendingClaim'

const COMMEMORATIVE_NFT_ABI = parseAbi([
  'function claim(bytes32[] proof)',
  'function hasClaimed(address account) view returns (bool)',
  'error AlreadyClaimed(uint256 tokenId)',
  'error InvalidProof()',
])

type CommemorativeNftClaimErrorReason =
  | 'user-rejected'
  | 'already-claimed'
  | 'invalid-proof'
  | 'reverted'
  | 'wallet-mismatch'
  | 'unsupported-network'
  | 'cancelled'
  | 'replaced'
  | 'storage-unavailable'
  | 'migration-incomplete'
  | 'feature-disabled'
  | 'claim-in-progress'
  | 'browser-unsupported'
  | 'generic'

export class CommemorativeNftClaimError extends Error {
  override readonly name = 'CommemorativeNftClaimError'

  constructor(
    readonly reason: CommemorativeNftClaimErrorReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

const errorChainText = (error: unknown): string => {
  const messages: string[] = []
  let current: unknown = error
  const visited = new Set<unknown>()

  while (current && !visited.has(current)) {
    visited.add(current)
    if (current instanceof Error)
      messages.push(`${current.name} ${current.message}`)
    current =
      typeof current === 'object' && current !== null && 'cause' in current
        ? current.cause
        : undefined
  }

  return messages.join(' ')
}

export const decodeCommemorativeNftClaimError = (
  error: unknown,
): CommemorativeNftClaimError => {
  if (error instanceof CommemorativeNftClaimError) return error

  const text = errorChainText(error)
  if (/user rejected|UserRejectedRequestError/i.test(text)) {
    return new CommemorativeNftClaimError(
      'user-rejected',
      'The mint request was cancelled.',
      { cause: error },
    )
  }
  if (/AlreadyClaimed/i.test(text)) {
    return new CommemorativeNftClaimError(
      'already-claimed',
      'This commemorative NFT has already been minted.',
      { cause: error },
    )
  }
  if (/InvalidProof/i.test(text)) {
    return new CommemorativeNftClaimError(
      'invalid-proof',
      'The eligibility proof could not be verified.',
      { cause: error },
    )
  }

  return new CommemorativeNftClaimError(
    'generic',
    'The commemorative NFT could not be minted. Please try again.',
    { cause: error },
  )
}

export const readCommemorativeNftClaimed = async (params: {
  readonly wagmiConfig: WagmiConfig
  readonly chainId: number
  readonly ownerAddress: Address
  readonly blockNumber?: bigint
  readonly signal?: AbortSignal
}): Promise<boolean> => {
  const contractAddress = getCommemorativeNftContractAddress(params.chainId)
  if (!contractAddress) {
    throw new CommemorativeNftClaimError(
      'unsupported-network',
      'The commemorative NFT is not available on this network.',
    )
  }

  return withRequestDeadline(
    () =>
      readContract(params.wagmiConfig, {
        abi: COMMEMORATIVE_NFT_ABI,
        address: contractAddress,
        functionName: 'hasClaimed',
        args: [params.ownerAddress],
        chainId: params.chainId,
        blockNumber: params.blockNumber,
      }),
    { signal: params.signal },
  )
}

export const encodeCommemorativeNftClaim = (proof: readonly Hex[]): Hex =>
  encodeFunctionData({
    abi: COMMEMORATIVE_NFT_ABI,
    functionName: 'claim',
    args: [proof],
  })

export const claimCommemorativeNft = async (params: {
  readonly wagmiConfig: WagmiConfig
  readonly chainId: number
  readonly ownerAddress: Address
  readonly walletAddress: Address
  readonly proof: readonly Hex[]
}): Promise<Hex> => {
  const contractAddress = getCommemorativeNftContractAddress(params.chainId)
  if (!contractAddress) {
    throw new CommemorativeNftClaimError(
      'unsupported-network',
      'The commemorative NFT is not available on this network.',
    )
  }

  if (
    getAddress(params.ownerAddress).toLowerCase() !==
    getAddress(params.walletAddress).toLowerCase()
  ) {
    throw new CommemorativeNftClaimError(
      'wallet-mismatch',
      'Reconnect the eligible owner wallet before minting.',
    )
  }

  try {
    return await writeContract(params.wagmiConfig, {
      abi: COMMEMORATIVE_NFT_ABI,
      account: params.walletAddress,
      address: contractAddress,
      functionName: 'claim',
      args: [params.proof],
      chainId: params.chainId,
    })
  } catch (error) {
    throw decodeCommemorativeNftClaimError(error)
  }
}

export type CommemorativeNftClaimReceiptResult = {
  readonly status:
    | 'confirmed'
    | 'cancelled'
    | 'replaced'
    | 'reverted'
    | 'pending'
  readonly hash: Hex
}

export const waitForCommemorativeNftClaimReceipt = async (params: {
  readonly wagmiConfig: WagmiConfig
  readonly pendingClaim: PendingNftClaim
  readonly onReplaced?: (hash: Hex) => void
  readonly signal?: AbortSignal
}): Promise<CommemorativeNftClaimReceiptResult> => {
  const { pendingClaim } = params
  const contractAddress = getCommemorativeNftContractAddress(
    pendingClaim.chainId,
  )
  if (
    contractAddress?.toLowerCase() !==
    pendingClaim.contractAddress.toLowerCase()
  ) {
    throw new CommemorativeNftClaimError(
      'unsupported-network',
      'The commemorative NFT is not available on this network.',
    )
  }
  const publicClient = getPublicClient(params.wagmiConfig, {
    chainId: pendingClaim.chainId,
  })
  if (!publicClient)
    throw new CommemorativeNftClaimError(
      'unsupported-network',
      'NFT public client is unavailable',
    )
  let hash = pendingClaim.hash
  let replacementReason: 'cancelled' | 'replaced' | 'repriced' | undefined
  try {
    const receipt = await withRequestDeadline(
      () =>
        waitForTransactionReceipt(publicClient, {
          hash,
          pollingInterval: 2_000,
          timeout: 5 * 60 * 1_000,
          onReplaced: (replacement) => {
            hash = replacement.transactionReceipt.transactionHash
            replacementReason = replacement.reason
            params.onReplaced?.(hash)
          },
        }),
      { signal: params.signal, timeoutMs: 5 * 60 * 1_000 },
    )
    hash = receipt.transactionHash
    if (replacementReason === 'cancelled') return { status: 'cancelled', hash }
    if (replacementReason === 'replaced') return { status: 'replaced', hash }
    if (receipt.status !== 'success') return { status: 'reverted', hash }

    // A successful same-nonce replacement can be an unrelated transfer. Check
    // the transaction itself as persisted data and replacement events are not
    // proof that this owner called the configured NFT claim.
    const transaction = await withRequestDeadline(
      () =>
        getTransaction(params.wagmiConfig, {
          chainId: pendingClaim.chainId,
          hash,
        }),
      { signal: params.signal },
    )
    if (
      transaction.from.toLowerCase() !==
        pendingClaim.ownerAddress.toLowerCase() ||
      transaction.to?.toLowerCase() !== contractAddress.toLowerCase() ||
      transaction.value !== 0n ||
      transaction.input.toLowerCase() !==
        pendingClaim.expectedClaimData.toLowerCase()
    ) {
      return { status: 'replaced', hash }
    }
    const claimed = await readCommemorativeNftClaimed({
      wagmiConfig: params.wagmiConfig,
      chainId: pendingClaim.chainId,
      ownerAddress: pendingClaim.ownerAddress,
      blockNumber: receipt.blockNumber,
      signal: params.signal,
    })
    return { status: claimed ? 'confirmed' : 'pending', hash }
  } catch {
    // Neither an RPC error nor the foreground deadline proves a transaction
    // failed. Preserve its hash and prevent resubmission until reconciled.
    return { status: 'pending', hash }
  }
}
