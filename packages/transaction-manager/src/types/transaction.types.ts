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

export interface RhinestoneTransactionRequest extends BaseTransactionRequest {
  type: 'rhinestone-intent'
  rhinestoneParams: {
    calls: Call[]
    sponsored?: boolean
    /** Token requests for cross-chain txs. Defaults to [] (skip balance validation). */
    tokenRequests?: TokenRequest[]
    /**
     * Whether to submit this call through the active smart-session
     * (when the signer is a session client). Defaults to `true` for
     * backward compatibility.
     *
     * Set to `false` for calls whose (target, selector) is not in the
     * session's action allowlist (e.g. resolver record writes from the
     * registration-scoped session). The transport will then omit
     * `signers` and fall back to the SCA's default validator, which
     * triggers an EOA-owner signature.
     */
    useSession?: boolean
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
  /**
   * Operation kind for transaction-history reporting, e.g. 'ens-renewal',
   * 'registration', 'set-resolver', 'set-primary-name', 'custom'. The semantic
   * operation is known by the caller (app/feature flow), not the core machine,
   * so it is supplied here and surfaced on the archived record.
   */
  operation?: string
  /** ENS name involved, for transaction-history display. */
  name?: string
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
