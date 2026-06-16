import type { TokenRequest } from '@rhinestone/sdk'
import type {
  Address,
  Chain,
  Hash,
  Hex,
  PublicClient,
  TransactionReceipt,
  WalletClient,
} from 'viem'
import type { TransactionInfra } from './signer.types'

export type TransactionType = 'eoa' | 'rhinestone-intent'

export interface BaseTransactionRequest {
  type: TransactionType
  from: Address
  to: Address
  value?: bigint
  data?: Hex
  chainId: number
}

export interface EOATransactionRequest extends BaseTransactionRequest {
  type: 'eoa'
  gas?: bigint
  gasPrice?: bigint
  maxFeePerGas?: bigint
  maxPriorityFeePerGas?: bigint
  nonce?: number
}

/**
 * Neutral call shape used by batched transaction requests (Rhinestone
 * intents today; potentially other batchable signers in the future).
 *
 * Also re-used by code paths that build up call lists ahead of time
 * (e.g. the migration service), independent of which transport submits
 * them.
 */
export interface Call {
  to: Address
  data: Hex
  value: bigint
}

/**
 * A source asset for a cross-chain intent: the token (and optional exact
 * amount) on a given source chain that funds the intent. The orchestrator
 * resolves the token by `address` (or `symbol` shorthand) on `chainId`.
 */
export interface CrossChainSourceAsset {
  chainId: number
  address?: Address
  symbol?: string
  amount?: bigint
}

export interface RhinestoneTransactionRequest extends BaseTransactionRequest {
  type: 'rhinestone-intent'
  rhinestoneParams: {
    calls: Call[]
    sponsored?: boolean
    /** Token requests for cross-chain txs. Defaults to [] (skip balance validation). */
    tokenRequests?: TokenRequest[]
    /**
     * Source chains to fund a cross-chain intent from. Defaults to the
     * target chain (same-chain intent). Chain IDs are mapped to viem chains
     * by the warp transport actor.
     */
    sourceChains?: number[]
    /** Specific source assets (token + chain) to fund the intent from. */
    sourceAssets?: CrossChainSourceAsset[]
    /**
     * Recipient of the bridged destination funds. Defaults to the account
     * (HCA). For ENS registration the registrar pulls rent from the EOA owner
     * (`_msgSender()` HCA→EOA unwrap), so cross-chain payments must deliver the
     * bridged token to the EOA — set this to the EOA owner address.
     */
    recipient?: Address
  }
}

export type TransactionRequest =
  | EOATransactionRequest
  | RhinestoneTransactionRequest

// Transaction Intents - High-level descriptions of what the user wants to do
// (Distinct from Rhinestone intents, which are chain abstraction intents)
export interface ENSRenewalTransactionIntent {
  type: 'ens-renewal'
  name: string // ENS name without .eth (e.g., "leon")
  duration: bigint // Duration in seconds
  from: Hex // Address of the account (EOA or smart account)
}

export interface ETHTransferTransactionIntent {
  type: 'eth-transfer'
  to: Hex
  value: bigint
  from: Hex
  data?: Hex
}

export interface CustomTransactionIntent {
  type: 'custom'
  request: TransactionRequest // Escape hatch for pre-prepared transactions
}

export type TransactionIntent =
  | ENSRenewalTransactionIntent
  | ETHTransferTransactionIntent
  | CustomTransactionIntent

/**
 * Smart Account Configuration
 *
 * Config interface for the Rhinestone smart-account signer.
 */
export type SmartAccountConfig = {
  chain?: Chain
  accountAddress?: Address
  rhinestoneApiKey: string
}

export interface TransactionOptions {
  usePrivateMempool?: boolean
  confirmations?: number
  timeout?: number
  retryCount?: number
  retryDelay?: number
  smartAccountConfig?: SmartAccountConfig
  description?: string
  modal?: Partial<TransactionModalState>
  id?: string
  publicClient?: PublicClient
  walletClient?: WalletClient
  /** Override the infrastructure for this transaction (warp or pimlico) */
  infrastructure?: TransactionInfra
}

export interface TransactionResult {
  hash: Hash
  receipt?: TransactionReceipt
  userOpHash?: Hash // For ERC-4337
  status: 'pending' | 'confirmed' | 'failed'
  timestamp: number
}

// Modal-related types
export type PaymentMethod =
  | 'eth'
  | 'namechain-eth'
  | 'usdc'
  | 'mainnet-usdc'
  | 'base-usdc'

export interface PaymentOption {
  method: PaymentMethod
  label: string
  balance?: string
  icon?: string
  network?: string
}

export interface TransactionStep {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  hash?: Hash
  error?: string
}

export type TransactionFlowType = 'single' | 'bridge' | 'batched'

export interface TransactionModalState {
  isOpen: boolean
  title?: string
  ensName?: string
  avatarUrl?: string
  network?: string
  estimatedCost?: string
  steps?: TransactionStep[]
  currentStepIndex?: number
  flowType?: TransactionFlowType
  selectedPayment?: PaymentMethod
  paymentOptions?: PaymentOption[]
}
