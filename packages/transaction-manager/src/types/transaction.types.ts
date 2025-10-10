import type { Hash, Hex, TransactionReceipt, Address } from 'viem'
import type { Chain } from 'wagmi/chains'

export type TransactionType = 'eoa' | 'erc4337' | 'rhinestone-intent'

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
}

export interface RhinestoneTransactionRequest extends BaseTransactionRequest {
  type: 'rhinestone-intent'
  rhinestoneParams?: {
    name: string
    duration: bigint
  }
}

export type TransactionRequest = EOATransactionRequest | ERC4337UserOperation | RhinestoneTransactionRequest

export interface RhinestoneConfig {
  chain?: Chain
  bundlerUrl?: string
  paymasterUrl?: string
  sponsorshipPolicyId?: string
  rhinestoneApiKey?: string
}

export interface TransactionOptions {
  usePrivateMempool?: boolean
  confirmations?: number
  timeout?: number
  retryCount?: number
  retryDelay?: number
  rhinestoneConfig?: RhinestoneConfig
  description?: string
}

export interface TransactionResult {
  hash: Hash
  receipt?: TransactionReceipt
  userOpHash?: Hash // For ERC-4337
  status: 'pending' | 'confirmed' | 'failed'
  timestamp: number
}

// Modal-related types
export type PaymentMethod = 'eth' | 'namechain-eth' | 'usdc' | 'mainnet-usdc' | 'base-usdc'

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