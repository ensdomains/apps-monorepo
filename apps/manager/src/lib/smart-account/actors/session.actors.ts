/**
 * Session actors (manager-app side) — standalone-HCA scoped SmartSessions.
 *
 * Thin wrappers around `@ens-apps/smart-account`'s session helpers. The session
 * is authorized HERE (in the app) BEFORE route selection — the single wallet
 * authorization signature — then the persisted session is rebuilt and attached
 * to the `RhinestoneSigner` passed into the registration machine.
 *
 * Flow:
 *   1. checkExistingSessionActor — reuse a valid stored session if present.
 *   2. createSessionActor — otherwise authorize one (the authorization
 *      signature) and persist it to localStorage.
 *   3. restoreSessionActor — validate a stored session before reuse.
 *
 * The stored record carries everything signer-construction needs to rebuild the
 * SDK `Session` (permissionId, resolver, nonce, validUntil, session key) so the
 * recomputed salt reproduces the same PermissionId.
 */

import {
  computeResolverAddress,
  createDestinationSession,
  createMultiChainSessions,
  createSourceNexus,
  DEFAULT_SESSION_VALIDITY_SECONDS,
  getDestinationContracts,
  getSkippedStatus,
  getSourceContracts,
  getValidSessionForAccount,
  hasRegistrationHeadroom,
  isRhinestoneSession,
  type RhinestoneStoredSession,
  type SessionEnableError,
  SessionRestoreError,
  type SessionScope,
  saveSession,
  serializeChainDigests,
} from '@ens-apps/smart-account'
import { logger } from '@ens-apps/utils/logger'
import type { RhinestoneAccount, RhinestoneSDK } from '@rhinestone/sdk'
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import type { Account, Address, Chain, PublicClient } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { customBaseSepolia } from '@/lib/wagmi'

export type CheckSessionInput = SessionScope

export interface CheckSessionOutput {
  readonly session: RhinestoneStoredSession | null
  readonly wasSkipped: boolean
}

/**
 * Reuse a valid stored session for THIS HCA (owner + chain verified), if any.
 * An owner-keyed lookup alone can return a session bound to a different
 * account/resolver; this scopes to the account and evicts on mismatch.
 */
export function checkExistingSessionActor(
  input: CheckSessionInput,
): ResultAsync<CheckSessionOutput, never> {
  const session = getValidSessionForAccount(input)
  const wasSkipped = getSkippedStatus(input.ownerAddress)

  if (session && !isRhinestoneSession(session)) {
    return okAsync({ session: null, wasSkipped: false })
  }
  return okAsync({ session, wasSkipped })
}

export interface CreateSessionInput {
  readonly ownerAddress: Address
  readonly accountAddress: Address
  readonly chainId: number
  readonly rhinestoneAccount: RhinestoneAccount
  readonly chain: Chain
  readonly publicClient: PublicClient
  /** Whether the HCA already has code (affects the session nonce source). */
  readonly alreadyDeployed: boolean
  readonly config?: { readonly validUntil?: number }
  /**
   * Cross-chain funding source. When set, a multi-chain session is authorized
   * (destination + source in a single wallet signature) so the user can pay
   * from a source chain (e.g. Base Sepolia USDC).
   */
  readonly sourceChainId?: number
  /**
   * SDK instance used to derive the source Nexus. Required with
   * `sourceChainId` — the Nexus must share the HCA's orchestrator/RPC config.
   */
  readonly sdk?: RhinestoneSDK
  /**
   * The connected wallet as a viem `Account`. Required with `sourceChainId`:
   * it becomes the Nexus's single ECDSA owner and the `SessionConfig.owner`
   * whose USDC the funding session is authorized to pull.
   */
  readonly walletAccount?: Account
  /** USDC (6dp) the source session may pull from the wallet. */
  readonly maxSourceAmount?: bigint
  /** USDC (6dp) the destination session may spend. */
  readonly maxDestinationAmount?: bigint
}

/** Default cross-chain caps: 100 USDC (6dp) per claim / per delivery. */
const DEFAULT_MAX_SOURCE_AMOUNT = 100_000_000n
const DEFAULT_MAX_DESTINATION_AMOUNT = 100_000_000n

interface ResolvedCrossChainInput {
  readonly sourceChainId: number
  readonly sdk: RhinestoneSDK
  readonly walletAccount: Account
  readonly sourceToken: Address
  readonly destinationToken: Address
  readonly maxSourceAmount: bigint
  readonly maxDestinationAmount: bigint
}

/**
 * Resolve the cross-chain inputs, or `null` for the same-chain route.
 *
 * Returns `null` when `sourceChainId` is set but the SDK or wallet account is
 * missing, so a half-configured caller falls back to the same-chain session
 * instead of authorizing a source session bound to a Nexus that was never
 * derived.
 *
 * NOTE the asymmetry in the token lookups: the SOURCE token comes from
 * `getSourceContracts` (Base Sepolia) while the DESTINATION token comes from
 * `getDestinationContracts` (Sepolia). They are separate chain-keyed tables and
 * Sepolia has no source entry — calling `getSourceContracts(sepolia.id)` throws
 * outright, which is what used to kill the cross-chain session at creation.
 */
function resolveCrossChainInput(
  input: CreateSessionInput,
): ResolvedCrossChainInput | null {
  const { sourceChainId, sdk, walletAccount } = input
  if (sourceChainId === undefined || !sdk || !walletAccount) return null
  return {
    sourceChainId,
    sdk,
    walletAccount,
    sourceToken: getSourceContracts(sourceChainId).usdc,
    destinationToken: getDestinationContracts(input.chainId).usdc,
    maxSourceAmount: input.maxSourceAmount ?? DEFAULT_MAX_SOURCE_AMOUNT,
    maxDestinationAmount:
      input.maxDestinationAmount ?? DEFAULT_MAX_DESTINATION_AMOUNT,
  }
}

export interface CreateSessionOutput {
  readonly session: RhinestoneStoredSession
}

/**
 * Authorize + persist a new session. Performs the single authorization
 * signature. When `sourceChainId` is set, a multi-chain session is authorized
 * (destination + source in one signature) for cross-chain funding; otherwise
 * the same-chain destination-only session is created.
 *
 * The source half is BEST-EFFORT. Authorizing it needs the source chain to be
 * reachable and its SmartSessions contracts to answer a nonce read, neither of
 * which the same-chain route depends on. A session is the gate on the entire
 * app, so a source-side failure falls back to the destination-only session:
 * the user can still register and manage names, and only the L2 funding option
 * is unavailable. Failing outright would lock every user out of the app over a
 * payment route most of them never pick.
 */
export function createSessionActor(
  input: CreateSessionInput,
): ResultAsync<CreateSessionOutput, SessionEnableError> {
  const sessionPrivateKey = generatePrivateKey()
  const sessionAccount = privateKeyToAccount(sessionPrivateKey)
  const resolver = computeResolverAddress({
    chainId: input.chainId,
    hca: input.accountAddress,
  })
  const validUntil = BigInt(
    input.config?.validUntil ??
      Math.floor(Date.now() / 1000) + DEFAULT_SESSION_VALIDITY_SECONDS,
  )

  const crossChain = resolveCrossChainInput(input)

  /** Destination-only session — the same-chain route, and the fallback. */
  const destinationOnly = (
    sourceAuthorizationFailed = false,
  ): ResultAsync<CreateSessionOutput, SessionEnableError> =>
    createDestinationSession({
      rhinestoneAccount: input.rhinestoneAccount,
      publicClient: input.publicClient,
      chain: input.chain,
      hca: input.accountAddress,
      resolver,
      sessionAccount,
      validUntil,
      alreadyDeployed: input.alreadyDeployed,
    }).map((result) => {
      const session: RhinestoneStoredSession = {
        id: crypto.randomUUID(),
        provider: 'rhinestone',
        sessionKeyAddress: sessionAccount.address,
        smartAccountAddress: input.accountAddress,
        ownerAddress: input.ownerAddress,
        createdAt: Date.now(),
        chainId: input.chainId,
        validUntil: Number(result.validUntil),
        sessionPrivateKey,
        permissionId: result.permissionId,
        resolver,
        hcaSessionNonce: result.hcaSessionNonce.toString(),
        authorization: result.enableData.userSignature,
        hashesAndChainIds: serializeChainDigests(
          result.enableData.hashesAndChainIds,
        ),
        sessionToEnableIndex: result.enableData.sessionToEnableIndex,
        // Records that the L2 half was tried and failed, so the next gate
        // check reuses this session instead of prompting again.
        ...(sourceAuthorizationFailed
          ? { sourceAuthorizationFailed: true }
          : {}),
      }
      saveSession(session)
      return { session }
    })

  return crossChain
    ? // Derive the Nexus FIRST: `createMultiChainSessions` must sign the source
      // session bound to the Nexus address, and the Nexus address in turn
      // depends on the source permission ID baked into its validator config.
      createSourceNexus({
        sdk: crossChain.sdk,
        chain: customBaseSepolia,
        wallet: input.ownerAddress,
        walletAccount: crossChain.walletAccount,
        hca: input.accountAddress,
        sourceToken: crossChain.sourceToken,
        destinationToken: crossChain.destinationToken,
        destinationChainId: BigInt(input.chainId),
        sessionAccount,
        validUntil,
        maxSourceAmount: crossChain.maxSourceAmount,
        maxDestinationAmount: crossChain.maxDestinationAmount,
      })
        .andThen((nexus) =>
          createMultiChainSessions({
            destination: {
              rhinestoneAccount: input.rhinestoneAccount,
              publicClient: input.publicClient,
              chain: input.chain,
              hca: input.accountAddress,
              resolver,
              sessionAccount,
              validUntil,
              alreadyDeployed: input.alreadyDeployed,
            },
            source: {
              chain: customBaseSepolia,
              hca: input.accountAddress,
              wallet: input.ownerAddress,
              nexusAddress: nexus.address,
              sourceToken: crossChain.sourceToken,
              destinationToken: crossChain.destinationToken,
              destinationChainId: BigInt(input.chainId),
              sessionAccount,
              validUntil,
              maxSourceAmount: crossChain.maxSourceAmount,
              maxDestinationAmount: crossChain.maxDestinationAmount,
            },
          }).map((result) => ({ result, nexus })),
        )
        .map(({ result, nexus }) => {
          const destResult = result.destination
          const sourceResult = result.source
          const session: RhinestoneStoredSession = {
            id: crypto.randomUUID(),
            provider: 'rhinestone',
            sessionKeyAddress: sessionAccount.address,
            smartAccountAddress: input.accountAddress,
            ownerAddress: input.ownerAddress,
            createdAt: Date.now(),
            chainId: input.chainId,
            validUntil: Number(destResult.validUntil),
            sessionPrivateKey,
            permissionId: destResult.permissionId,
            resolver,
            hcaSessionNonce: destResult.hcaSessionNonce.toString(),
            authorization: destResult.enableData.userSignature,
            hashesAndChainIds: serializeChainDigests(
              destResult.enableData.hashesAndChainIds,
            ),
            sessionToEnableIndex: destResult.enableData.sessionToEnableIndex,
            sourceChainId: crossChain.sourceChainId,
            sourcePermissionId: sourceResult.permissionId,
            sourceNexusAddress: nexus.address,
            sourceSessionKeyAddress: sessionAccount.address,
            sourceAuthorization: sourceResult.enableData.userSignature,
            sourceHashesAndChainIds: serializeChainDigests(
              sourceResult.enableData.hashesAndChainIds,
            ),
            sourceSessionToEnableIndex:
              sourceResult.enableData.sessionToEnableIndex,
            maxSourceAmount: crossChain.maxSourceAmount.toString(),
            maxDestinationAmount: crossChain.maxDestinationAmount.toString(),
          }
          saveSession(session)
          return { session }
        })
        // The L2 funding half is optional; the app is not. Anything that goes
        // wrong deriving the Nexus or authorizing the source session degrades
        // to the same-chain session rather than blocking the user.
        .orElse((error) => {
          logger.error(
            'Cross-chain session authorization failed; falling back to a ' +
              'same-chain session (L2 funding will be unavailable)',
            error,
          )
          return destinationOnly(true)
        })
    : destinationOnly()
}

export interface RestoreSessionInput {
  readonly session: RhinestoneStoredSession
}

/** Validate a stored session for reuse (no new signature). */
export function restoreSessionActor(
  input: RestoreSessionInput,
): ResultAsync<void, SessionRestoreError> {
  const { session } = input

  if (!isRhinestoneSession(session)) {
    return errAsync(
      new SessionRestoreError({
        message: 'Session type mismatch: expected Rhinestone session',
      }),
    )
  }
  if (session.validUntil && Date.now() > session.validUntil * 1000) {
    return errAsync(new SessionRestoreError({ message: 'Session has expired' }))
  }
  return okAsync(undefined)
}

export interface ResolveSessionInput {
  readonly ownerAddress: Address
  readonly accountAddress: Address
  readonly chain: Chain
  readonly rhinestoneAccount: RhinestoneAccount
  readonly publicClient: PublicClient
  readonly alreadyDeployed: boolean
  /**
   * Cross-chain funding source (e.g. Base Sepolia). Set when the user picked an
   * L2 stablecoin, so the single authorization covers the source session too.
   */
  readonly sourceChainId?: number
  readonly sdk?: RhinestoneSDK
  readonly walletAccount?: Account
  readonly maxSourceAmount?: bigint
  readonly maxDestinationAmount?: bigint
}

export interface ResolvedSession {
  readonly session: RhinestoneStoredSession
}

/**
 * Reuse a valid stored session if present, else authorize one (the single
 * authorization signature).
 *
 * On resume, expiry is checked client-side here. Enable-data is NOT gated on
 * on-chain enablement: it is replayed from the stored authorization whenever a
 * batch carries the funding permit, since the validator only accepts that pair
 * on the path the proof unlocks.
 */
export function resolveSessionActor(
  input: ResolveSessionInput,
): ResultAsync<ResolvedSession, SessionEnableError> {
  const { ownerAddress, accountAddress, chain } = input

  const stored = getValidSessionForAccount({
    accountAddress,
    ownerAddress,
    chainId: chain.id,
  })
  // Is the stored session usable for the REQUESTED route?
  //
  //  - bound to the requested source chain (or none requested) → yes.
  //  - bound to a DIFFERENT source chain → no; it cannot fund from the one
  //    asked for, so re-authorize rather than fail at claim time.
  //  - no source binding at all → upgrade it, so a user holding a same-chain
  //    session can still reach the L2 route. UNLESS the source half was
  //    already tried and failed, in which case retrying just reproduces the
  //    same degraded session and costs a wallet prompt each time.
  const rhinestoneStored =
    stored?.provider === 'rhinestone'
      ? (stored as RhinestoneStoredSession)
      : undefined
  const sourceMatches =
    input.sourceChainId === undefined ||
    rhinestoneStored?.sourceChainId === input.sourceChainId ||
    (rhinestoneStored?.sourceChainId === undefined &&
      rhinestoneStored?.sourceAuthorizationFailed === true)
  // Mint a fresh session rather than reusing one that would expire mid-flight:
  // the reveal is session-signed and runs AFTER `MIN_COMMITMENT_AGE`, so a
  // session that only just outlives the commit strands the commitment. This
  // mirrors `needsSessionBeforeRegistration`; if the two disagreed, the gate
  // would prompt and then be handed back the same expiring session forever.
  if (
    !stored ||
    !isRhinestoneSession(stored) ||
    !hasRegistrationHeadroom(stored) ||
    !sourceMatches
  ) {
    return createAndResolve(input)
  }

  return restoreSessionActor({ session: stored })
    .map((): ResolvedSession => ({ session: stored }))
    .orElse(() => createAndResolve(input))
}

function createAndResolve(
  input: ResolveSessionInput,
): ResultAsync<ResolvedSession, SessionEnableError> {
  return createSessionActor({
    ownerAddress: input.ownerAddress,
    accountAddress: input.accountAddress,
    chainId: input.chain.id,
    rhinestoneAccount: input.rhinestoneAccount,
    chain: input.chain,
    publicClient: input.publicClient,
    alreadyDeployed: input.alreadyDeployed,
    ...(input.sourceChainId === undefined
      ? {}
      : {
          sourceChainId: input.sourceChainId,
          ...(input.sdk ? { sdk: input.sdk } : {}),
          ...(input.walletAccount
            ? { walletAccount: input.walletAccount }
            : {}),
          ...(input.maxSourceAmount === undefined
            ? {}
            : { maxSourceAmount: input.maxSourceAmount }),
          ...(input.maxDestinationAmount === undefined
            ? {}
            : { maxDestinationAmount: input.maxDestinationAmount }),
        }),
  }).map(({ session }) => ({ session }))
}
