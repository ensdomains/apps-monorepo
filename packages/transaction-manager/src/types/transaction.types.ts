import type { Address, Chain, Hash, Hex, TransactionReceipt } from 'viem'

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
  [key: string]: unknown // Index signature for bundler compatibility
}

export interface RhinestoneTransactionRequest extends BaseTransactionRequest {
  type: 'rhinestone-intent'
  rhinestoneParams?: {
    name: string
    duration: bigint
  }
}

export type TransactionRequest =
  | EOATransactionRequest
  | ERC4337UserOperation
  | RhinestoneTransactionRequest

// Transaction Intents - High-level descriptions of what the user wants to do
// (Distinct from Rhinestone intents, which are chain abstraction intents)
export interface ENSRenewalTransactionIntent {
  type: 'ens-renewal'
  name: string // ENS name without .eth (e.g., "leon")
  duration: bigint // Duration in seconds
  from: Hex // Address of the account (EOA or smart account)
}

export interface ENSRegistrationTransactionIntent {
  type: 'ens-registration'
  name: string // ENS name without .eth (e.g., "vitalik")
  duration: bigint // Duration in seconds
  owner: Address
  resolver: Address
  paymentToken: Address // ERC20 token or 0x0000000000000000000000000000000000000000 for ETH
  registrarAddress: Address
  registryAddress: Address // Subregistry address (usually 0x0 for default)
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
  | ENSRegistrationTransactionIntent
  | ETHTransferTransactionIntent
  | CustomTransactionIntent

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
  modal?: Partial<TransactionModalState>
  id?: string
  publicClient?: any // PublicClient from viem
  walletClient?: any // WalletClient from viem
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
