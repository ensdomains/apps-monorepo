import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { KernelAccountClient } from '@zerodev/sdk'
import type { SmartAccountClient } from 'permissionless'
import type { WalletClient } from 'viem'

import type { SmartAccountConfig } from './transaction.types'

/**
 * Signer Types
 *
 * Abstract signer interface that decouples transaction submission
 * from specific account implementations (EOA, Rhinestone, ZeroDev, etc.)
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
}

/**
 * ZeroDev Smart Account Signer
 * Uses ZeroDev Kernel with smart sessions for sign-once UX
 * Bundled via Pimlico
 *
 * Supports both:
 * - KernelAccountClient (external wallets with sessions)
 * - SmartAccountClient (Para-embedded wallets without sessions)
 */
export interface ZeroDevSigner {
  type: 'zerodev'
  account: KernelAccountClient | SmartAccountClient // Both use Pimlico bundler
  config: SmartAccountConfig & {
    /** Whether this client is a session-derived client */
    isSessionClient?: boolean
  }
}

/**
 * ERC-4337 Account Abstraction Signer
 * (Future implementation)
 */
export interface ERC4337Signer {
  type: 'erc4337'
  userOpClient: unknown // Bundler client
  account: unknown
}

/**
 * Privy Embedded Wallet Signer
 * (Future implementation)
 */
export interface PrivySigner {
  type: 'privy'
  privyClient: unknown
  walletClient: WalletClient
}

/**
 * Safe Multisig Signer
 * (Future implementation)
 */
export interface SafeSigner {
  type: 'safe'
  safeClient: unknown
  walletClient: WalletClient
}

/**
 * Union type of all supported signers
 */
export type Signer =
  | EOASigner
  | RhinestoneSigner
  | ZeroDevSigner
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
 * Type guard to check if signer is ZeroDev
 */
export function isZeroDevSigner(signer: Signer): signer is ZeroDevSigner {
  return signer.type === 'zerodev'
}

/**
 * Type guard to check if signer is ERC-4337
 */
export function isERC4337Signer(signer: Signer): signer is ERC4337Signer {
  return signer.type === 'erc4337'
}
