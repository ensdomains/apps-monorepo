import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { SmartAccountClient } from 'permissionless'
import type { Account, WalletClient } from 'viem'
import type { SmartAccountConfig } from './transaction.types'

/**
 * Signer Types
 *
 * Abstract signer interface that decouples transaction submission
 * from specific account implementations (EOA, Rhinestone, Pimlico, Privy, Safe, etc.)
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
 * Uses Rhinestone SDK account for chain abstraction
 */
export interface RhinestoneSigner {
  type: 'rhinestone'
  account: RhinestoneAccount // RhinestoneAccount from @rhinestone/sdk
  config: SmartAccountConfig
  eoaAccountSigner?: Account
}

/**
 * Pimlico Smart Account Signer
 * Uses permissionless SmartAccountClient with Para + Pimlico bundler
 */
export interface PimlicoSigner {
  type: 'pimlico'
  account: SmartAccountClient // SmartAccountClient from permissionless
  config: SmartAccountConfig
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
  | PimlicoSigner
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
 * Type guard to check if signer is Pimlico
 */
export function isPimlicoSigner(signer: Signer): signer is PimlicoSigner {
  return signer.type === 'pimlico'
}

/**
 * Type guard to check if signer is ERC-4337
 */
export function isERC4337Signer(signer: Signer): signer is ERC4337Signer {
  return signer.type === 'erc4337'
}
