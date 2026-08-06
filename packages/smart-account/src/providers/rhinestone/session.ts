/**
 * Standalone-HCA session construction (scoped SmartSessions).
 *
 * A "session" here is a scoped ERC-7579 SmartSession on the standalone
 * `HCAOwnerAndSessionValidator` — NOT the old ephemeral-owner model. The wallet
 * signs ONE multi-chain authorization up front (before route selection); the
 * session is then enabled lazily inside the first HCA action via
 * `enableSessionWithRefund(...)`. No separate ENABLE transaction.
 *
 * Cross-chain support: for intents that fund from a source chain (e.g. Base
 * Sepolia USDC), we build BOTH a destination session (Sepolia) and a source
 * session. Both are authorized in the same multi-chain signature and handed to
 * the SDK as a `PerChainSessionSignerSet`. The source session authorizes the
 * `hcaFundingSessionValidator` on the source chain to pull USDC via permit +
 * `transferFrom` inside `sourceCalls`.
 *
 * Field orders in the salt encoders are EXACT and load-bearing (they must match
 * the on-chain validator + the reference `liveHcaRhinestoneRegistration`
 * script). Do not reorder.
 */

import type {
  ChainSessionConfig,
  RhinestoneAccount,
  RhinestoneSDK,
  Session,
} from '@rhinestone/sdk'
import { getPermissionId } from '@rhinestone/sdk/smart-sessions'
import { fromPromise, type ResultAsync } from 'neverthrow'
import {
  type Account,
  type Address,
  type Chain,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  keccak256,
  type PublicClient,
  parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { SessionEnableError } from '../../errors'
import {
  encodeFundingSessionConfig,
  getDestinationContracts,
  getSourceContracts,
  MAX_REFUND_AMOUNT,
  MAX_REFUND_EXCHANGE_RATE,
  MAX_REFUND_GAS_OVERHEAD,
} from './manifest'

const standaloneHcaAbi = parseAbi([
  'function ownerAndSessionNonce() view returns (address owner, uint96 sessionNonce)',
])

/**
 * Per-session enable-data (the value passed to the Rhinestone signer). NOTE:
 * this is NOT the raw authorization bytes — each entry references the session
 * by index into the signed session set. Only the destination entry carries
 * the HCA nonce.
 *
 * Aliased from the SDK's own (unexported) shape via `ChainSessionConfig` so
 * values flow into `signers.enableData` without structural friction.
 */
export type SessionEnableData = NonNullable<ChainSessionConfig['enableData']>

/** One chain digest entry from `SessionDetails.hashesAndChainIds`. */
export type ChainDigest = SessionEnableData['hashesAndChainIds'][number]

export interface DestinationSessionParams {
  /** Live SDK account (used for getSessionDetails / signEnableSession). */
  readonly rhinestoneAccount: RhinestoneAccount
  /** Public client for reading `ownerAndSessionNonce()` on existing HCAs. */
  readonly publicClient: PublicClient
  readonly chain: Chain
  readonly hca: Address
  /** The resolver this session is bound to (a PermissionedResolver proxy). */
  readonly resolver: Address
  /** Ephemeral session key (single ECDSA session owner). */
  readonly sessionAccount: Account
  /** Session expiry (unix seconds). */
  readonly validUntil: bigint
  /** Whether the HCA already has code (determines the nonce source). */
  readonly alreadyDeployed: boolean
}

export interface DestinationSessionResult {
  readonly session: Session
  readonly permissionId: Hex
  readonly enableData: SessionEnableData
  readonly hcaSessionNonce: bigint
  readonly validUntil: bigint
}

export interface SourceSessionParams {
  readonly chain: Chain
  /** The HCA address on the destination chain (the delivery recipient). */
  readonly hca: Address
  /**
   * The connected WALLET (EOA). This is the account whose USDC the source
   * session is authorized to pull, and it is bound into BOTH the source salt
   * and the validator's `SessionConfig.owner`. It is NOT the session key.
   */
  readonly wallet: Address
  /** The Nexus address on the source chain (created with HCAFundingSessionValidator). */
  readonly nexusAddress: Address
  /** The USDC token on the source chain (the token the user holds). */
  readonly sourceToken: Address
  /** The USDC token on the destination chain (the token the registrar accepts). */
  readonly destinationToken: Address
  readonly destinationChainId: bigint
  /** Ephemeral session key (single ECDSA session owner). */
  readonly sessionAccount: Account
  /** Session expiry (unix seconds). */
  readonly validUntil: bigint
  /** Max USDC (6dp) the source session may pull from the wallet. */
  readonly maxSourceAmount: bigint
  /** Max USDC (6dp) the destination session may spend. */
  readonly maxDestinationAmount: bigint
}

export interface SourceSessionResult {
  readonly session: Session
  /**
   * Permission ID of the source session, derived from the session WITHOUT its
   * account — this is the value baked into the Nexus's installed
   * `SessionConfig`, so it must be computed the same way here.
   */
  readonly permissionId: Hex
  readonly enableData: SessionEnableData
  readonly validUntil: bigint
}

/**
 * Compute the destination (HCA-side) session salt. EXACT field order:
 * uint96 nonce, uint48 validUntil, address resolver, address refundToken,
 * uint96 maxRefundExchangeRate, uint48 maxRefundGasOverhead,
 * uint96 maxRefundAmount.
 */
export function computeDestinationSessionSalt(params: {
  readonly hcaSessionNonce: bigint
  readonly validUntil: bigint
  readonly resolver: Address
  readonly refundToken: Address
  readonly maxRefundExchangeRate?: bigint
  readonly maxRefundGasOverhead?: bigint
  readonly maxRefundAmount?: bigint
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'uint96' },
        { type: 'uint48' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint96' },
        { type: 'uint48' },
        { type: 'uint96' },
      ],
      [
        params.hcaSessionNonce,
        Number(params.validUntil),
        params.resolver,
        params.refundToken,
        params.maxRefundExchangeRate ?? MAX_REFUND_EXCHANGE_RATE,
        Number(params.maxRefundGasOverhead ?? MAX_REFUND_GAS_OVERHEAD),
        params.maxRefundAmount ?? MAX_REFUND_AMOUNT,
      ],
    ),
  )
}

/**
 * Compute the source (funding Nexus-side) session salt. EXACT field order:
 * address wallet, uint48 validUntil, address sourceToken, address hca,
 * address destinationToken, uint64 destinationChainId, uint96 maxSourceAmount,
 * uint96 maxDestinationAmount.
 *
 * `wallet` is the connected EOA — the account the Nexus is authorized to pull
 * USDC from — NOT the ephemeral session key. Passing the session key here
 * yields a salt (and therefore a permission ID) the deployed Nexus was never
 * configured with, and the source claim fails validation.
 *
 * NOTE: `acrossArbiter` is NOT part of the salt. The "HCA: New" handoff doc
 * lists one, but the deployed `HCAFundingSessionValidator` (contracts-v2 @
 * 97a5729) resolves the active Across adapter from the Rhinestone Router at
 * claim time instead. Field order verified against the reference
 * `liveHcaRhinestoneRegistration.ts` encoder.
 */
export function computeSourceSessionSalt(params: {
  readonly wallet: Address
  readonly validUntil: bigint
  readonly sourceToken: Address
  readonly hca: Address
  readonly destinationToken: Address
  readonly destinationChainId: bigint
  readonly maxSourceAmount: bigint
  readonly maxDestinationAmount: bigint
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint48' },
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint64' },
        { type: 'uint96' },
        { type: 'uint96' },
      ],
      [
        params.wallet,
        Number(params.validUntil),
        params.sourceToken,
        params.hca,
        params.destinationToken,
        params.destinationChainId,
        params.maxSourceAmount,
        params.maxDestinationAmount,
      ],
    ),
  )
}

/**
 * Read the HCA session nonce. Undeployed HCAs use nonce 0; deployed HCAs must
 * read `ownerAndSessionNonce()` before a new authorization.
 */
async function readSessionNonce(params: {
  publicClient: PublicClient
  hca: Address
  alreadyDeployed: boolean
}): Promise<bigint> {
  if (!params.alreadyDeployed) return 0n
  const [, nonce] = await params.publicClient.readContract({
    address: params.hca,
    abi: standaloneHcaAbi,
    functionName: 'ownerAndSessionNonce',
  })
  return nonce
}

/**
 * Build + sign the destination HCA session authorization (same-chain route).
 *
 * This is the FIRST wallet prompt. The returned `enableData` is passed to the
 * Rhinestone signer for the first HCA action; the session is enabled lazily
 * there (no separate ENABLE tx).
 */
export function createDestinationSession(
  params: DestinationSessionParams,
): ResultAsync<DestinationSessionResult, SessionEnableError> {
  return fromPromise(
    (async () => {
      const c = getDestinationContracts(params.chain.id)
      const hcaSessionNonce = await readSessionNonce({
        publicClient: params.publicClient,
        hca: params.hca,
        alreadyDeployed: params.alreadyDeployed,
      })

      const salt = computeDestinationSessionSalt({
        hcaSessionNonce,
        validUntil: params.validUntil,
        resolver: params.resolver,
        refundToken: c.usdc,
      })

      const session: Session = {
        chain: params.chain,
        account: params.hca,
        salt,
        owners: { type: 'ecdsa', accounts: [params.sessionAccount] },
      }

      const permissionId = getPermissionId(session)

      // ONE multi-chain authorization signature (destination only for now).
      const details =
        await params.rhinestoneAccount.experimental_getSessionDetails([session])
      const userSignature =
        await params.rhinestoneAccount.experimental_signEnableSession(details)

      const enableData: SessionEnableData = {
        userSignature,
        hashesAndChainIds: details.hashesAndChainIds,
        sessionToEnableIndex: 0,
        hcaSessionNonce,
      }

      return {
        session,
        permissionId,
        enableData,
        hcaSessionNonce,
        validUntil: params.validUntil,
      }
    })(),
    (error: unknown) =>
      new SessionEnableError({
        message: 'Failed to create destination HCA session authorization',
        cause: error,
      }),
  )
}

/** Inputs that pin down a source (funding chain) session and its Nexus. */
export interface SourceNexusParams {
  /** SDK client, used to derive the Nexus address deterministically. */
  readonly sdk: RhinestoneSDK
  readonly chain: Chain
  /** The connected WALLET (EOA) — the Nexus owner and the pull source. */
  readonly wallet: Address
  /**
   * The wallet as a viem `Account`. The Nexus's single ECDSA owner, matching
   * the reference script's `owners.accounts: [sourceOwner]`.
   */
  readonly walletAccount: Account
  /** The HCA on the destination chain (the delivery recipient). */
  readonly hca: Address
  readonly sourceToken: Address
  readonly destinationToken: Address
  readonly destinationChainId: bigint
  /** Ephemeral session key shared with the destination session. */
  readonly sessionAccount: Account
  readonly validUntil: bigint
  readonly maxSourceAmount: bigint
  readonly maxDestinationAmount: bigint
}

export interface SourceNexusResult {
  /** Live SDK account for the Nexus — cross-chain intents are SENT from it. */
  readonly account: RhinestoneAccount
  readonly address: Address
  /** Derived from the account-less session; matches the installed config. */
  readonly permissionId: Hex
  readonly salt: Hex
}

/**
 * Derive the source Nexus that holds the funding session on the source chain
 * (Base Sepolia).
 *
 * The Nexus address is deterministic (CREATE2) — nothing is deployed here. The
 * first Rhinestone route deploys it as a setup op.
 *
 * Order matters and mirrors the reference script: the source salt is computed
 * first, the permission ID is taken from the session WITHOUT an account, that
 * ID goes into the validator's `SessionConfig`, and only then does the SDK
 * derive the Nexus from that config. Deriving the permission ID from a session
 * that already carries the account would bake a different ID into the config
 * than the one the claim presents.
 */
export function createSourceNexus(
  params: SourceNexusParams,
): ResultAsync<SourceNexusResult, SessionEnableError> {
  return fromPromise(
    (async () => {
      const sourceContracts = getSourceContracts(params.chain.id)
      const salt = computeSourceSessionSalt({
        wallet: params.wallet,
        validUntil: params.validUntil,
        sourceToken: params.sourceToken,
        hca: params.hca,
        destinationToken: params.destinationToken,
        destinationChainId: params.destinationChainId,
        maxSourceAmount: params.maxSourceAmount,
        maxDestinationAmount: params.maxDestinationAmount,
      })

      const permissionId = getPermissionId({
        chain: params.chain,
        salt,
        owners: { type: 'ecdsa', accounts: [params.sessionAccount] },
      })

      const initData = encodeFundingSessionConfig({
        permissionId,
        owner: params.wallet,
        validUntil: params.validUntil,
        sessionKey: params.sessionAccount.address,
        sourceToken: params.sourceToken,
        destinationRecipient: params.hca,
        destinationToken: params.destinationToken,
        destinationChainId: params.destinationChainId,
        maxSourceAmount: params.maxSourceAmount,
        maxDestinationAmount: params.maxDestinationAmount,
      })

      const account = await params.sdk.createAccount({
        account: { type: 'nexus' },
        owners: { type: 'ecdsa', accounts: [params.walletAccount] },
        experimental_sessions: {
          enabled: true,
          module: sourceContracts.hcaFundingSessionValidator,
          initData,
        },
      })

      return {
        account,
        address: account.getAddress() as Address,
        permissionId,
        salt,
      }
    })(),
    (error: unknown) =>
      new SessionEnableError({
        message: 'Failed to derive the source funding Nexus',
        cause: error,
      }),
  )
}

export interface MultiChainSessionParams {
  readonly destination: DestinationSessionParams
  readonly source: SourceSessionParams
}

export interface MultiChainSessionResult {
  readonly destination: DestinationSessionResult
  readonly source: SourceSessionResult
}

/**
 * Authorize the destination AND source sessions together — ONE wallet prompt
 * signs both via `experimental_signEnableSession`. The returned
 * `sessionToEnableIndex` on each `enableData` points to that session's index
 * in the signed set (destination = 0, source = 1), so the SDK's
 * `PerChainSessionSignerSet` can attach each proof to the correct chain.
 */
export function createMultiChainSessions(
  params: MultiChainSessionParams,
): ResultAsync<MultiChainSessionResult, SessionEnableError> {
  return fromPromise(
    (async () => {
      const hcaSessionNonce = await readSessionNonce({
        publicClient: params.destination.publicClient,
        hca: params.destination.hca,
        alreadyDeployed: params.destination.alreadyDeployed,
      })

      const destContracts = getDestinationContracts(params.destination.chain.id)
      const destSalt = computeDestinationSessionSalt({
        hcaSessionNonce,
        validUntil: params.destination.validUntil,
        resolver: params.destination.resolver,
        refundToken: destContracts.usdc,
      })
      const destSession: Session = {
        chain: params.destination.chain,
        account: params.destination.hca,
        salt: destSalt,
        owners: {
          type: 'ecdsa',
          accounts: [params.destination.sessionAccount],
        },
      }

      const sourceSalt = computeSourceSessionSalt({
        wallet: params.source.wallet,
        validUntil: params.source.validUntil,
        sourceToken: params.source.sourceToken,
        hca: params.source.hca,
        destinationToken: params.source.destinationToken,
        destinationChainId: params.source.destinationChainId,
        maxSourceAmount: params.source.maxSourceAmount,
        maxDestinationAmount: params.source.maxDestinationAmount,
      })
      const sourceSessionWithoutAccount = {
        chain: params.source.chain,
        salt: sourceSalt,
        owners: {
          type: 'ecdsa' as const,
          accounts: [params.source.sessionAccount],
        },
      }
      // The permission ID the Nexus was configured with — derived WITHOUT the
      // account, exactly as `createSourceNexus` did when it built the
      // validator's `SessionConfig`. The authorization below still signs the
      // account-bearing session; only the ID derivation differs.
      const sourcePermissionId = getPermissionId(sourceSessionWithoutAccount)
      const sourceSession: Session = {
        ...sourceSessionWithoutAccount,
        account: params.source.nexusAddress,
      }

      const sessions = [destSession, sourceSession]
      const details =
        await params.destination.rhinestoneAccount.experimental_getSessionDetails(
          sessions,
        )
      const userSignature =
        await params.destination.rhinestoneAccount.experimental_signEnableSession(
          details,
        )

      const destEnableData: SessionEnableData = {
        userSignature,
        hashesAndChainIds: details.hashesAndChainIds,
        sessionToEnableIndex: 0,
        hcaSessionNonce,
      }
      // The source entry carries NO `hcaSessionNonce`: the nonce belongs to the
      // destination HCA's `_validateSessionEnableProof`, and the source
      // validator has no such counter. Including it makes the source proof
      // decode to a different payload than the one that was signed.
      const sourceEnableData: SessionEnableData = {
        userSignature,
        hashesAndChainIds: details.hashesAndChainIds,
        sessionToEnableIndex: 1,
      }

      return {
        destination: {
          session: destSession,
          permissionId: getPermissionId(destSession),
          enableData: destEnableData,
          hcaSessionNonce,
          validUntil: params.destination.validUntil,
        },
        source: {
          session: sourceSession,
          permissionId: sourcePermissionId,
          enableData: sourceEnableData,
          validUntil: params.source.validUntil,
        },
      }
    })(),
    (error: unknown) =>
      new SessionEnableError({
        message: 'Failed to create multi-chain HCA session authorization',
        cause: error,
      }),
  )
}

/**
 * Build the `enableSessionWithRefund(...)` validator call for the first HCA
 * action. Arg order is EXACT: permissionId, sessionKey, validUntil, resolver,
 * refundToken, maxRefundExchangeRate, maxRefundGasOverhead, maxRefundAmount.
 */
const enableSessionWithRefundAbi = parseAbi([
  'function enableSessionWithRefund(bytes32 permissionId, address sessionKey, uint48 validUntil, address resolver, address refundToken, uint96 maxRefundExchangeRate, uint48 maxRefundGasOverhead, uint96 maxRefundAmount)',
])

export function buildEnableSessionWithRefundCall(params: {
  readonly chainId: number
  readonly permissionId: Hex
  readonly sessionKey: Address
  readonly validUntil: bigint
  readonly resolver: Address
}): { to: Address; value: bigint; data: Hex } {
  const c = getDestinationContracts(params.chainId)
  return {
    to: c.hcaOwnerAndSessionValidator,
    value: 0n,
    data: encodeFunctionData({
      abi: enableSessionWithRefundAbi,
      functionName: 'enableSessionWithRefund',
      args: [
        params.permissionId,
        params.sessionKey,
        Number(params.validUntil),
        params.resolver,
        c.usdc,
        MAX_REFUND_EXCHANGE_RATE,
        Number(MAX_REFUND_GAS_OVERHEAD),
        MAX_REFUND_AMOUNT,
      ],
    }),
  }
}

/**
 * Rebuild the SDK `Session` object from a stored/persisted session, WITHOUT a
 * new wallet prompt. Recomputes the exact salt (so the `permissionId` matches)
 * and re-derives the ephemeral session-key account from its private key.
 *
 * Used on resume: the app persists the scalar fields (nonce, validUntil,
 * resolver, key) and rebuilds the `Session` + `SessionEnableData` to hand to
 * the Rhinestone signer.
 */
export function rebuildDestinationSession(params: {
  readonly chain: Chain
  readonly hca: Address
  readonly resolver: Address
  readonly hcaSessionNonce: bigint
  readonly validUntil: bigint
  readonly sessionPrivateKey: Hex
}): { session: Session; permissionId: Hex } {
  const c = getDestinationContracts(params.chain.id)
  const salt = computeDestinationSessionSalt({
    hcaSessionNonce: params.hcaSessionNonce,
    validUntil: params.validUntil,
    resolver: params.resolver,
    refundToken: c.usdc,
  })
  const session: Session = {
    chain: params.chain,
    account: params.hca,
    salt,
    owners: {
      type: 'ecdsa',
      accounts: [privateKeyToAccount(params.sessionPrivateKey)],
    },
  }
  return { session, permissionId: getPermissionId(session) }
}

/**
 * Rebuild the source `Session` from a persisted session, WITHOUT a wallet
 * prompt — the cross-chain counterpart to `rebuildDestinationSession`.
 *
 * The session is bound to the NEXUS on the source chain, not to the HCA: the
 * source claim is validated by `HCAFundingSessionValidator` installed on the
 * Nexus. `permissionId` is derived from the account-less session so it matches
 * the ID inside that installed config.
 */
export function rebuildSourceSession(params: {
  readonly chain: Chain
  readonly hca: Address
  /** Connected wallet (EOA) — bound into the salt as the pull source. */
  readonly wallet: Address
  /** The Nexus this session lives on. */
  readonly nexusAddress: Address
  readonly validUntil: bigint
  readonly sessionPrivateKey: Hex
  readonly sourceToken: Address
  readonly destinationToken: Address
  readonly destinationChainId: bigint
  readonly maxSourceAmount: bigint
  readonly maxDestinationAmount: bigint
}): { session: Session; permissionId: Hex } {
  const salt = computeSourceSessionSalt({
    wallet: params.wallet,
    validUntil: params.validUntil,
    sourceToken: params.sourceToken,
    hca: params.hca,
    destinationToken: params.destinationToken,
    destinationChainId: params.destinationChainId,
    maxSourceAmount: params.maxSourceAmount,
    maxDestinationAmount: params.maxDestinationAmount,
  })
  const owners = {
    type: 'ecdsa' as const,
    accounts: [privateKeyToAccount(params.sessionPrivateKey)],
  }
  const permissionId = getPermissionId({ chain: params.chain, salt, owners })
  return {
    session: {
      chain: params.chain,
      account: params.nexusAddress,
      salt,
      owners,
    },
    permissionId,
  }
}
