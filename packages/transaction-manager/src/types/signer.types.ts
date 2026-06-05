import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Address, WalletClient } from 'viem'

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
 * from specific account implementations (EOA, Rhinestone).
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
 *
 * Uses a Rhinestone HCA (Hidden Contract Account) for chain abstraction
 * and gas sponsorship. The HCA is session-less: every Intent is
 * authorized by the account's ENS owner (the connected wallet) and
 * gas-sponsored through the Warp orchestrator.
 */
export interface RhinestoneSigner {
  type: 'rhinestone'
  account: RhinestoneAccount // RhinestoneAccount from @rhinestone/sdk
  config: SmartAccountConfig & {
    /** Default infrastructure preference for this signer */
    defaultInfra?: TransactionInfra
  }
}

/**
 * Union type of all supported signers
 */
export type Signer = EOASigner | RhinestoneSigner

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
