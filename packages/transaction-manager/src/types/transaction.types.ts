import type {
  Address,
  Chain,
  Hash,
  Hex,
  PublicClient,
  TransactionReceipt,
  WalletClient,
} from 'viem'

export type TransactionType =
  | 'eoa'
  | 'erc4337'
  | 'rhinestone-intent'
  | 'pimlico'
  | 'kernel'

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

export interface ERC4337UserOperation extends BaseTransactionRequest {
  type: 'erc4337'
  callData: Hex
  callGasLimit: bigint
  verificationGasLimit: bigint
  preVerificationGas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  paymasterAndData?: Hex
  signature?: Hex
  entryPoint: Address
  [key: string]: unknown
}

export interface RhinestoneCall {
  to: Address
  data: Hex
  value: bigint
}

export interface RhinestoneTransactionRequest extends BaseTransactionRequest {
  type: 'rhinestone-intent'
  rhinestoneParams: {
    calls: RhinestoneCall[]
    sponsored?: boolean
  }
}

/**
 * Pimlico Transaction Request
 * Uses permissionless SmartAccountClient with calls array (similar to Rhinestone)
 */
export interface PimlicoCall {
  to: Address
  data: Hex
  value: bigint
}

export interface PimlicoTransactionRequest extends BaseTransactionRequest {
  type: 'pimlico'
  pimlicoParams: {
    calls: PimlicoCall[]
    sponsored?: boolean
  }
}

/**
 * Kernel Transaction Request (ZeroDev)
 * Uses KernelAccountClient with calls array (similar to Pimlico)
 * Works with both master account and session-derived clients
 */
export interface KernelCall {
  to: Address
  data: Hex
  value: bigint
}

export interface KernelTransactionRequest extends BaseTransactionRequest {
  type: 'kernel'
  kernelParams: {
    calls: KernelCall[]
    sponsored?: boolean
  }
}

export type TransactionRequest =
  | EOATransactionRequest
  | ERC4337UserOperation
  | RhinestoneTransactionRequest
  | PimlicoTransactionRequest
  | KernelTransactionRequest

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
 * Shared config interface for all smart account signers (Pimlico, Rhinestone, etc.)
 * Contains chain info, bundler/paymaster URLs, and account details.
 */
export type SmartAccountConfig = {
  chain?: Chain
  bundlerUrl?: string
  paymasterUrl?: string
  sponsorshipPolicyId?: string
  walletClient?: WalletClient
  accountAddress?: Address
  accountType?: 'simple' | 'hca'
  hcaFactoryAddress?: Address
} & ({ rhinestoneApiKey: string } | { pimlicoApiKey: string })

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
  publicClient?: PublicClient // PublicClient from viem
  walletClient?: WalletClient // WalletClient from viem
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
