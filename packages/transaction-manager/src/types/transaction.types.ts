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

export type TransactionRequest = EOATransactionRequest | ERC4337UserOperation

export interface TransactionOptions {
  usePrivateMempool?: boolean
  confirmations?: number
  timeout?: number
  retryCount?: number
  retryDelay?: number
}

export interface TransactionResult {
  hash: Hash
  receipt?: TransactionReceipt
  userOpHash?: Hash // For ERC-4337
  status: 'pending' | 'confirmed' | 'failed'
  timestamp: number
}