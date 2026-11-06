import { orSafeExecution } from '@ens-apps/transaction-manager'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import {
  type Connector,
  getPublicClient,
  getTransaction,
  readContract,
  type Config as WagmiConfig,
  writeContract,
} from '@wagmi/core'
import { fromPromise, ok } from 'neverthrow'
import {
  type Address,
  encodeFunctionData,
  getAddress,
  type Hex,
  parseAbi,
  type WaitForTransactionReceiptParameters,
} from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { ensureWalletChain } from '@/lib/wallet/ensureWalletChain'
import { withRequestDeadline } from '../service/requestDeadline'
import { getCommemorativeNftContractAddress } from './config'
import {
  type CommemorativeNftClaimSettlement,
  getCommemorativeNftReceiptDecision,
  getFailedCommemorativeNftClaimOutcome,
  getHistoricalCommemorativeNftSafeSettlement,
  getVerifiedCommemorativeNftClaimOutcome,
} from './contract.helpers'
import type { PendingNftClaim } from './pendingClaim'
import { readHistoricalCommemorativeNftSafeExecution } from './safeExecutionHistory'

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
  const contractAddress = getCommemorativeNftContractAddress()
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
  const contractAddress = getCommemorativeNftContractAddress()
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
    await ensureWalletChain(params.wagmiConfig, params.chainId)
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

const CLAIM_RECEIPT_TIMEOUT_MS = 5 * 60 * 1_000

export const waitForCommemorativeNftClaimReceipt = async (params: {
  readonly wagmiConfig: WagmiConfig
  readonly pendingClaim: PendingNftClaim
  /** The wallet's connector. A Safe{Wallet} one answers with safeTxHashes. */
  readonly connector?: Connector
  readonly onReplaced?: (hash: Hex) => void
  readonly onHistoryProgress?: (fromBlock: bigint) => void
  readonly signal?: AbortSignal
}): Promise<CommemorativeNftClaimReceiptResult> => {
  const { pendingClaim } = params
  const contractAddress = getCommemorativeNftContractAddress()
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
  const receiptOf = (receipt: WaitForTransactionReceiptParameters) =>
    fromPromise(
      waitForTransactionReceipt(publicClient, {
        pollingInterval: 2_000,
        ...receipt,
      }),
      (cause) => cause,
    )
  const waitForSettlement = ResultFn(async function* (signal: AbortSignal) {
    const historical = yield* fromPromise(
      readHistoricalCommemorativeNftSafeExecution({
        publicClient,
        connector: params.connector,
        ownerAddress: pendingClaim.ownerAddress,
        safeTxHash: pendingClaim.hash,
        searchFromBlock: pendingClaim.safeExecutionSearchFromBlock,
        onHistoryProgress: params.onHistoryProgress,
        signal,
      }),
      (cause) => cause,
    )
    const direct = historical
      ? receiptOf({ hash: historical.transactionHash }).andThen((receipt) =>
          getHistoricalCommemorativeNftSafeSettlement({
            receipt,
            isSuccess: historical.isSuccess,
            safeTxHash: pendingClaim.hash,
          }),
        )
      : receiptOf({
          hash,
          timeout: CLAIM_RECEIPT_TIMEOUT_MS,
          onReplaced: (replacement) => {
            hash = replacement.transactionReceipt.transactionHash
            replacementReason = replacement.reason
            params.onReplaced?.(hash)
          },
        }).map(
          (receipt): CommemorativeNftClaimSettlement => ({
            receipt,
            kind: 'direct',
          }),
        )
    const settlement = yield* orSafeExecution({
      publicClient,
      connector: params.connector,
      account: pendingClaim.ownerAddress,
      id: pendingClaim.hash,
      timeout: CLAIM_RECEIPT_TIMEOUT_MS,
      direct,
      settle: (transactionHash) =>
        receiptOf({ hash: transactionHash }).map(
          (receipt): CommemorativeNftClaimSettlement => ({
            receipt,
            kind: 'safe',
          }),
        ),
      signal,
    })
    return ok(settlement)
  })
  const settled = fromPromise(
    withRequestDeadline(async (signal) => waitForSettlement(signal), {
      signal: params.signal,
      timeoutMs: CLAIM_RECEIPT_TIMEOUT_MS,
    }),
    (cause) => cause,
  ).andThen((result) => result)

  const verifyClaim = ResultFn(async function* (
    settlement: CommemorativeNftClaimSettlement,
  ) {
    const { receipt } = settlement
    hash =
      settlement.kind === 'safe' ? pendingClaim.hash : receipt.transactionHash
    const decision = getCommemorativeNftReceiptDecision({
      settlement,
      replacementReason,
    })
    if (decision !== 'verify')
      return ok<CommemorativeNftClaimReceiptResult>({ status: decision, hash })

    // A successful same-nonce replacement can be an unrelated transfer. Check
    // the transaction itself as persisted data and replacement events are not
    // proof that this owner called the configured NFT claim.
    if (settlement.kind === 'direct') {
      const transaction = yield* fromPromise(
        withRequestDeadline(
          () =>
            getTransaction(params.wagmiConfig, {
              chainId: pendingClaim.chainId,
              hash,
            }),
          { signal: params.signal },
        ),
        (cause) => cause,
      )
      if (
        transaction.from.toLowerCase() !==
          pendingClaim.ownerAddress.toLowerCase() ||
        transaction.to?.toLowerCase() !== contractAddress.toLowerCase() ||
        transaction.value !== 0n ||
        transaction.input.toLowerCase() !==
          pendingClaim.expectedClaimData.toLowerCase()
      ) {
        return ok<CommemorativeNftClaimReceiptResult>({
          status: 'replaced',
          hash,
        })
      }
    }
    const hasClaimed = yield* fromPromise(
      readCommemorativeNftClaimed({
        wagmiConfig: params.wagmiConfig,
        chainId: pendingClaim.chainId,
        ownerAddress: pendingClaim.ownerAddress,
        blockNumber: receipt.blockNumber,
        signal: params.signal,
      }),
      (cause) => cause,
    )
    return ok(
      getVerifiedCommemorativeNftClaimOutcome({
        settlement,
        submittedHash: pendingClaim.hash,
        hasClaimed,
      }),
    )
  })

  return settled.andThen(verifyClaim).match(
    (outcome) => outcome,
    // An RPC error or the foreground deadline does not prove failure.
    (cause) => getFailedCommemorativeNftClaimOutcome({ cause, hash }),
  )
}
