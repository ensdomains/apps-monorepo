import type { RhinestoneAccount, Session } from '@rhinestone/sdk'
import type { Address, WalletClient } from 'viem'

import type { SessionEnableData, SmartAccountConfig } from './transaction.types'

/**
 * Transaction infrastructure options
 * - warp: Intent-based via Rhinestone Warp (user-paid; no sponsorship)
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
 * Active scoped SmartSession attached to a Rhinestone signer (standalone-HCA
 * model).
 *
 * The wallet signed ONE multi-chain session authorization; the ephemeral
 * session key inside `session.owners` then signs Intents prompt-free. The
 * transport passes `signers: { type: 'experimental_session', session,
 * enableData, verifyExecutions: true }`.
 *
 * `HCAOwnerAndSessionValidator` keeps no session state: it only accepts
 * session signatures that carry the owner's authorization (envelope mode
 * 0x05), so `enableData` goes out with EVERY session-signed intent.
 */
export interface RhinestoneSessionContext {
  /** The SDK scoped-session object (embeds the ephemeral session-key account). */
  readonly session: Session
  /**
   * The owner's authorization for `session`, attached to every intent it
   * signs. A request's own `rhinestoneParams.sessionEnableData` wins.
   */
  readonly enableData?: SessionEnableData
}

/**
 * Rhinestone Smart Account Signer
 *
 * Uses the standalone ENS HCA. Intents are session-signed and USER-PAID in
 * USDC (`feeAsset: 'USDC'`) — there is NO gas sponsorship, and no way to ask
 * for any: the transport always sends the user-paid shape. The HCA is funded from
 * the wallet via an EIP-2612 permit + `transferFrom` pair carried inside the
 * first (commit) request; execution costs are refunded from the HCA's USDC,
 * within the caps the session authorization fixes.
 *
 * Authorization is either:
 *   - owner-signed (no `session`): the connected wallet signs each Intent;
 *   - session-signed (`session` set): the ephemeral session key signs
 *     prompt-free after the single authorization signature.
 */
export interface RhinestoneSigner {
  type: 'rhinestone'
  account: RhinestoneAccount // RhinestoneAccount from @rhinestone/sdk
  config: SmartAccountConfig & {
    /** Default infrastructure preference for this signer */
    defaultInfra?: TransactionInfra
  }
  /** Active scoped session, if any. Absent → owner-signed Intents. */
  session?: RhinestoneSessionContext
}

/**
 * Union type of all supported signers
 */
export type Signer = EOASigner | RhinestoneSigner
