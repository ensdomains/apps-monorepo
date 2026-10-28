import type { RhinestoneAccount, Session } from '@rhinestone/sdk'
import type { ResultAsync } from 'neverthrow'
import type { Address, Chain, WalletClient } from 'viem'

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
  /**
   * The wallet's wagmi connector id (its EIP-6963 rdns when injected). Lets an
   * atomic batch upgrade the EOA through EIP-7702 on wallets whose delegate
   * can own an HCA; see `getAtomicBatchSupport`.
   */
  readonly walletId?: string
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
  /** Pays this signer's intents from the wallet's USDC on an L2 instead. */
  readonly l2Funding?: L2FundingSource
  /** USDC (6dp) checkout showed `l2Funding` being charged, fee included. */
  readonly l2DisplayedCharge?: bigint
}

/**
 * The wallet's USDC on an L2, paying for an HCA intent on the app chain: the
 * wallet signs one Permit2 transfer on `chain`, Across delivers the intent's
 * token request to the HCA, and the HCA then runs the intent's calls.
 */
export interface L2FundingSource {
  readonly chain: Chain
  /** The USDC paid on `chain`. */
  readonly token: Address
  /** The wallet's SDK account on `chain`, which signs the transfer. */
  readonly getAccount: () => ResultAsync<RhinestoneAccount, unknown>
  /** Have Permit2 allowed to move `amount` of `token`, asking the wallet if not. */
  readonly ensureAllowance: (amount: bigint) => Promise<void>
}

/**
 * Union type of all supported signers
 */
export type Signer = EOASigner | RhinestoneSigner
