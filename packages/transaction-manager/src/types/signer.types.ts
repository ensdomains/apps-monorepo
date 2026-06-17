import type { RhinestoneAccount, SignerSet } from '@rhinestone/sdk'
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
 * Union type of all supported signers
 */
export type Signer = EOASigner | RhinestoneSigner
