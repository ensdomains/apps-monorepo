import type { RhinestoneAccount, SignerSet } from '@rhinestone/sdk'
import type { KernelAccountClient } from '@zerodev/sdk'
import type { SmartAccountClient } from 'permissionless'
import type { Address, Hex, WalletClient } from 'viem'

import type { SmartAccountConfig } from './transaction.types'

/**
 * Transaction infrastructure options
 * - warp: Intent-based via Rhinestone Warp (non-ERC-4337 path)
 * - pimlico: ERC-4337 via Pimlico bundler
 */
export type TransactionInfra = 'warp' | 'pimlico'

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
  /**
   * Optional normalized account metadata for callers that do not want to
   * access address through walletClient.account.
   */
  account?: {
    address: Address
  }
  walletClient: WalletClient
}

/**
 * Rhinestone Smart Account Signer
 * Uses Rhinestone SDK account for chain abstraction
 */
export interface RhinestoneSigner {
  type: 'rhinestone'
  account: RhinestoneAccount // RhinestoneAccount from @rhinestone/sdk
  config: SmartAccountConfig & {
    /** Whether this is a session-based signer */
    isSessionClient?: boolean
    /** Session private key for session-based signing */
    sessionPrivateKey?: Hex
    /** Parsed session config consumed by Rhinestone experimental session mode */
    sessionConfig?: {
      signers: SignerSet
    }
    /** Default infrastructure preference for this signer */
    defaultInfra?: TransactionInfra
  }
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
 * Union type of all supported signers
 */
export type Signer = EOASigner | RhinestoneSigner | ZeroDevSigner

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
 * Type guard to check if signer is session-enabled smart account signer
 * (supported for both ZeroDev and Rhinestone signer configs).
 */
export function isSessionSigner(signer: Signer): boolean {
  if (isZeroDevSigner(signer) || isRhinestoneSigner(signer)) {
    return signer.config.isSessionClient ?? false
  }
  return false
}
