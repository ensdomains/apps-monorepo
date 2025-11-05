import type { WalletClient } from 'viem'
import type { RhinestoneConfig } from './transaction.types'

/**
 * Signer Types
 *
 * Abstract signer interface that decouples transaction submission
 * from specific account implementations (EOA, Rhinestone, Privy, Safe, etc.)
 */

/**
 * EOA Signer - Uses a standard Ethereum wallet
 */
export interface EOASigner {
  type: 'eoa'
  walletClient: WalletClient
}

/**
 * Rhinestone Smart Account Signer
 */
export interface RhinestoneSigner {
  type: 'rhinestone'
  account: any // RhinestoneAccount from @rhinestone/sdk
  config: RhinestoneConfig
}

/**
 * ERC-4337 Account Abstraction Signer
 * (Future implementation)
 */
export interface ERC4337Signer {
  type: 'erc4337'
  userOpClient: any // Bundler client
  account: any
}

/**
 * Privy Embedded Wallet Signer
 * (Future implementation)
 */
export interface PrivySigner {
  type: 'privy'
  privyClient: any
  walletClient: WalletClient
}

/**
 * Safe Multisig Signer
 * (Future implementation)
 */
export interface SafeSigner {
  type: 'safe'
  safeClient: any
  walletClient: WalletClient
}

/**
 * Union type of all supported signers
 */
export type Signer =
  | EOASigner
  | RhinestoneSigner
  | ERC4337Signer
  | PrivySigner
  | SafeSigner

/**
 * Type guard to check if signer is EOA
 */
export function isEOASigner(signer: Signer): signer is EOASigner {
  return signer.type === 'eoa'
}

/**
 * Type guard to check if signer is Rhinestone
 */
export function isRhinestoneSigner(signer: Signer): signer is RhinestoneSigner {
  return signer.type === 'rhinestone'
}

/**
 * Type guard to check if signer is ERC-4337
 */
export function isERC4337Signer(signer: Signer): signer is ERC4337Signer {
  return signer.type === 'erc4337'
}
