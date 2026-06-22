import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Account, Address, WalletClient } from 'viem'

import type { SmartAccountConfig } from './transaction.types'

/**
 * Transaction infrastructure options
 * - warp: Intent-based via Rhinestone Warp (relayer-sponsored)
 */
export type TransactionInfra = 'warp'

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
 * Active smart-session attached to a Rhinestone signer (owner-key model).
 *
 * The ephemeral key has been added as a time-boxed HCA owner, so it can sign
 * Intents directly. When present, the warp transport authorizes Intents with
 * this ephemeral account (no per-Intent owner prompt) by passing
 * `signers: { type: 'owner', kind: 'ecdsa', accounts: [sessionAccount] }`.
 * Without a session the signer falls back to the connected owner.
 */
export interface RhinestoneSessionContext {
  /** The ephemeral session-key account that signs Intents (a valid HCA owner). */
  readonly sessionAccount: Account
}

/**
 * Rhinestone Smart Account Signer
 *
 * Uses a Rhinestone HCA (Hidden Contract Account) for chain abstraction and
 * gas sponsorship. Intents are gas-sponsored through the Warp orchestrator.
 *
 * Authorization is either:
 *   - owner-signed (no `session`): the connected ENS owner signs each Intent;
 *   - session-signed (`session` set): an ephemeral session key signs Intents
 *     prompt-free after a single owner ENABLE signature.
 */
export interface RhinestoneSigner {
  type: 'rhinestone'
  account: RhinestoneAccount // RhinestoneAccount from @rhinestone/sdk
  config: SmartAccountConfig & {
    /** Default infrastructure preference for this signer */
    defaultInfra?: TransactionInfra
  }
  /** Active smart session, if any. Absent → owner-signed Intents. */
  session?: RhinestoneSessionContext
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
