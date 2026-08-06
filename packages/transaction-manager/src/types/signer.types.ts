import type {
  ChainSessionConfig,
  RhinestoneAccount,
  RhinestoneAccountConfig,
  Session,
} from '@rhinestone/sdk'
import type { Address, WalletClient } from 'viem'

import type { SmartAccountConfig } from './transaction.types'

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
 * Active scoped SmartSession(s) attached to a Rhinestone signer (standalone-HCA
 * model).
 *
 * Same-chain: the wallet signed ONE session authorization; the ephemeral
 * session key inside `session.owners` then signs Intents prompt-free. The
 * transport passes `signers: { type: 'experimental_session', session,
 * enableData?, verifyExecutions: true }`.
 *
 * Cross-chain: the wallet signed ONE multi-chain session authorization
 * covering both the destination and source sessions. The transport passes a
 * `PerChainSessionSignerSet` so each chain's Intent is signed by its own
 * session (with its own `enableData`).
 *
 * In both cases, `enableData` travels PER-REQUEST in
 * `rhinestoneParams.sessionEnableData` (only until the on-chain
 * `enableSessionWithRefund` call in the first HCA action lands; omit after).
 */
export type RhinestoneSessionContext =
  | SingleSessionSignerSet
  | PerChainSessionSignerSet

/** Same-chain: one session on the destination chain. */
export interface SingleSessionSignerSet {
  readonly type: 'experimental_session'
  readonly session: Session
  readonly enableData?: ChainSessionConfig['enableData']
  readonly verifyExecutions?: boolean
}

/** Cross-chain: one session per chain, each with its own enable-data. */
export interface PerChainSessionSignerSet {
  readonly type: 'experimental_session'
  readonly sessions: Record<number, ChainSessionConfig>
  readonly verifyExecutions?: boolean
}

/**
 * Rhinestone Smart Account Signer
 *
 * Uses the standalone ENS HCA. Intents are session-signed and USER-PAID in
 * USDC (`feeAsset: 'USDC'`) — there is NO gas sponsorship, and no way to ask
 * for any: the transport always sends the user-paid shape. The HCA is funded from
 * the wallet via an EIP-2612 permit + `transferFrom` pair carried inside the
 * first (commit) request; execution costs are refunded from the HCA's USDC
 * via `enableSessionWithRefund`.
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
  /** Cross-chain funding context. Absent → same-chain only. */
  crossChain?: CrossChainFundingContext
}

/**
 * What a cross-chain (L2-funded) intent needs beyond the same-chain shape.
 *
 * A cross-chain intent is NOT sent from the HCA. It is sent from the source
 * Nexus — the account that holds the funding session and actually moves the
 * USDC — with the HCA named as `recipient`. The orchestrator then builds a
 * source element (claim on Base Sepolia) and a destination element (fill on
 * Sepolia) and settles them over Across.
 *
 * Submitting from the HCA instead produces an intent with no source element at
 * all, which is why `sourceCalls` were silently dropped and no USDC ever left
 * the wallet.
 */
export interface CrossChainFundingContext {
  /** The funding Nexus on the source chain — the intent's SENDER. */
  readonly account: RhinestoneAccount
  readonly address: Address
  /** The HCA's account config, passed to the SDK as `recipient`. */
  readonly recipient: RhinestoneAccountConfig
  readonly chainId: number
  /** USDC on the source chain (what the wallet holds and the Nexus pulls). */
  readonly sourceToken: Address
  /** USDC on the destination chain (what the registrar is paid in). */
  readonly destinationToken: Address
}

/**
 * Union type of all supported signers
 */
export type Signer = EOASigner | RhinestoneSigner
