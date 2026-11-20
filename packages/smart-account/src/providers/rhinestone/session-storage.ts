/**
 * Session storage — localStorage persistence for standalone-HCA sessions.
 *
 * "Session" is a scoped ERC-7579 SmartSession on the standalone
 * `HCAOwnerAndSessionValidator`. The stored record holds the ephemeral session
 * key plus the resume state (permission ID, multi-chain authorization,
 * per-chain digests, resolver binding, HCA nonce), keyed by smart-account (HCA)
 * address and refund token, so a session — and an in-flight registration spanning the commit
 * cooldown — survives page reloads. The wallet signs the authorization once per
 * stored session.
 *
 * Storage-key versioning: the key is bumped whenever the stored-session SHAPE
 * changes, so stale rows from an incompatible layout are ignored rather than
 * mis-deserialized. Old rows are harmless cruft; a fresh session is authorized
 * on the next registration with a single signature.
 *
 *   v5 → v6: replaced the ephemeral-owner record with the scoped-SmartSession
 *            record (permissionId, authorization, hashesAndChainIds, resolver,
 *            hcaSessionNonce, sessionToEnableIndex). See ./types.ts.
 *   v6 → v7: SDK patch bumped (5e0a5f32… → 7603298e…). The session
 *            authorization / enable-data encoding changed, so any session
 *            signed under the old patch is invalid and must be re-authorized.
 *   v7 → v8: rotated to the remediated PR #388 HCA, validator, factory, and
 *            resolver namespace. Sessions bind those addresses into their
 *            permission IDs and must not cross the deployment boundary.
 *   v8 → v9: payment/refund token switched from Circle Sepolia USDC to
 *            MockUSDC. The refund token is part of the session salt, so a
 *            session authorized under the old token would refund in a token
 *            the HCA no longer holds. The validator + HCA implementation were
 *            also redeployed (contracts-v2 #409) so the validator accepts that
 *            token. Sessions are bound to the validator and HCA addresses.
 *
 *   (no bump) records gained an optional `refundCaps`. A v9 row without it
 *            was signed with `LEGACY_REFUND_CAPS`, which is what it rebuilds
 *            with, so old rows stay valid.
 *   v9 → v10: payment/refund token switched back to Circle Sepolia USDC, so
 *            v9 sessions refund in a token the HCA no longer holds.
 *   v10 → v11: payment/refund token switched back to ensjs' MockUSDC, so v10
 *            sessions refund in a token the HCA no longer holds. Records also
 *            gained an optional `refundToken`, so an account keeps one session
 *            per token: an ETH payment refunds in the USDC its swap buys.
 */

import { type Address, isAddress, isHex } from 'viem'
import { DESTINATION_CONTRACTS } from './manifest'
import { isOwnerSessionAuthorization } from './session-authorization'
import { deserializeChainDigests, type RhinestoneStoredSession } from './types'

const SESSION_STORAGE_KEY = 'ens-sessions-v11'
const SKIPPED_SESSION_KEY = 'ens-session-skipped'

const hasWindow = (): boolean => typeof window !== 'undefined'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isUnsignedIntegerString = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value)

const isChainDigest = (
  value: unknown,
): value is RhinestoneStoredSession['hashesAndChainIds'][number] =>
  isRecord(value) &&
  isUnsignedIntegerString(value.chainId) &&
  typeof value.sessionDigest === 'string' &&
  isHex(value.sessionDigest)

const isRefundCaps = (
  value: unknown,
): value is NonNullable<RhinestoneStoredSession['refundCaps']> =>
  isRecord(value) &&
  isUnsignedIntegerString(value.maxRefundExchangeRate) &&
  isUnsignedIntegerString(value.maxRefundGasOverhead) &&
  isUnsignedIntegerString(value.maxRefundAmount)

const isStoredSession = (value: unknown): value is RhinestoneStoredSession =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  value.id.length > 0 &&
  value.provider === 'rhinestone' &&
  typeof value.sessionKeyAddress === 'string' &&
  isAddress(value.sessionKeyAddress, { strict: false }) &&
  typeof value.smartAccountAddress === 'string' &&
  isAddress(value.smartAccountAddress, { strict: false }) &&
  typeof value.ownerAddress === 'string' &&
  isAddress(value.ownerAddress, { strict: false }) &&
  isNonNegativeSafeInteger(value.createdAt) &&
  isNonNegativeSafeInteger(value.chainId) &&
  isNonNegativeSafeInteger(value.validUntil) &&
  typeof value.sessionPrivateKey === 'string' &&
  isHex(value.sessionPrivateKey) &&
  typeof value.permissionId === 'string' &&
  isHex(value.permissionId) &&
  typeof value.resolver === 'string' &&
  isAddress(value.resolver, { strict: false }) &&
  isUnsignedIntegerString(value.hcaSessionNonce) &&
  typeof value.authorization === 'string' &&
  isHex(value.authorization) &&
  Array.isArray(value.hashesAndChainIds) &&
  value.hashesAndChainIds.every(isChainDigest) &&
  isNonNegativeSafeInteger(value.sessionToEnableIndex) &&
  (value.refundCaps === undefined || isRefundCaps(value.refundCaps)) &&
  (value.refundToken === undefined ||
    (typeof value.refundToken === 'string' &&
      isAddress(value.refundToken, { strict: false })))

/** Whether `session` refunds in `refundToken`; absent on either side means the deployment's USDC. */
const refundsIn = (
  session: RhinestoneStoredSession,
  refundToken: Address | undefined,
): boolean => {
  const fallback = DESTINATION_CONTRACTS[session.chainId]?.usdc
  return (
    (session.refundToken ?? fallback)?.toLowerCase() ===
    (refundToken ?? fallback)?.toLowerCase()
  )
}

const isSessionFor = (
  session: RhinestoneStoredSession,
  accountAddress: Address,
  refundToken: Address | undefined,
): boolean =>
  session.smartAccountAddress.toLowerCase() === accountAddress.toLowerCase() &&
  refundsIn(session, refundToken)

/** Drop one stored record, leaving the account's sessions in other tokens. */
const removeStoredSession = (session: RhinestoneStoredSession): void => {
  if (!hasWindow()) return
  const next = getAllSessions().filter((s) => s.id !== session.id)
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
}

/** Get all stored sessions. */
export function getAllSessions(): readonly RhinestoneStoredSession[] {
  if (!hasWindow()) return []
  try {
    const data = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!data) return []
    const sessions: unknown = JSON.parse(data)
    return Array.isArray(sessions) ? sessions.filter(isStoredSession) : []
  } catch {
    return []
  }
}

/** Get a session by smart-account (HCA) address and refund token (default: the deployment's USDC). */
export function getSession(
  accountAddress: Address,
  refundToken?: Address,
): RhinestoneStoredSession | null {
  return (
    getAllSessions().find((s) =>
      isSessionFor(s, accountAddress, refundToken),
    ) ?? null
  )
}

/** Get a session by owner EOA address. */
export function getSessionByOwner(
  ownerAddress: Address,
): RhinestoneStoredSession | null {
  const normalized = ownerAddress.toLowerCase()
  return (
    getAllSessions().find((s) => s.ownerAddress.toLowerCase() === normalized) ??
    null
  )
}

/** Save a session, replacing any existing session for the same account and refund token. */
export function saveSession(session: RhinestoneStoredSession): void {
  if (!hasWindow()) return
  const next: RhinestoneStoredSession[] = [
    ...getAllSessions().filter(
      (s) => !isSessionFor(s, session.smartAccountAddress, session.refundToken),
    ),
    session,
  ]
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
}

/**
 * Forget every session for a smart-account address, in every refund token.
 *
 * LOCAL ONLY — this is not a revocation. It drops our copy of the record; a
 * copy already taken off this device stays usable until `validUntil`. The
 * validator is stateless: the record carries the owner-signed authorization,
 * every session-signed intent presents it inline, and nothing on-chain records
 * that a session exists. The only true revocation is
 * `StandaloneSingleOwnerHCA.revokeSessions()`, which bumps the account session
 * nonce the authorization is checked against (see `revoke-sessions.ts`). That
 * is `onlyOwner` and unreachable from the account's own execution paths, so it
 * needs a direct owner EOA transaction.
 */
export function removeSession(accountAddress: Address): void {
  if (!hasWindow()) return
  const normalized = accountAddress.toLowerCase()
  const next = getAllSessions().filter(
    (s) => s.smartAccountAddress.toLowerCase() !== normalized,
  )
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
}

/** Forget all sessions for an owner EOA. LOCAL ONLY — see `removeSession`. */
export function removeSessionsByOwner(ownerAddress: Address): void {
  if (!hasWindow()) return
  const normalized = ownerAddress.toLowerCase()
  const next = getAllSessions().filter(
    (s) => s.ownerAddress.toLowerCase() !== normalized,
  )
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next))
}

/** Forget every stored session. LOCAL ONLY — see `removeSession`. */
export function clearAllSessions(): void {
  if (!hasWindow()) return
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

/** Read whether a user has skipped session creation. */
export function getSkippedStatus(ownerAddress: Address): boolean {
  if (!hasWindow()) return false
  return (
    localStorage.getItem(
      `${SKIPPED_SESSION_KEY}-${ownerAddress.toLowerCase()}`,
    ) === 'true'
  )
}

/** Persist whether a user has skipped session creation. */
export function setSkippedStatus(
  ownerAddress: Address,
  skipped: boolean,
): void {
  if (!hasWindow()) return
  const key = `${SKIPPED_SESSION_KEY}-${ownerAddress.toLowerCase()}`
  if (skipped) localStorage.setItem(key, 'true')
  else localStorage.removeItem(key)
}

/**
 * Client-side expiry check — a UX preflight that evicts stale rows and
 * surfaces a re-auth prompt before the user spends an Intent. The actual expiry
 * boundary is enforced on-chain by the session's `validUntil` (an expired
 * scoped session fails validation). Returns `false` for sessions with no
 * `validUntil` (treat as non-expiring).
 */
export function isSessionExpired(session: RhinestoneStoredSession): boolean {
  if (!session.validUntil) return false
  return Date.now() > session.validUntil * 1000
}

/**
 * Remaining session lifetime required to START a registration.
 *
 * A registration spans TWO session-signed legs separated by the registrar's
 * commitment cooldown: commit → `MIN_COMMITMENT_AGE` → reveal. A session that
 * has merely not expired *yet* can therefore die during the cooldown, which
 * strands a commitment the user has already paid gas for: the reveal reverts
 * (`SessionExpired`, wrapped as `InvalidSignature()`), and recovering needs a
 * fresh authorization AND a fresh commitment.
 *
 * Sized as a deliberately generous static bound on that window — the commit
 * submission timeout (120s), the cooldown (60s on Sepolia), and the reveal
 * submission timeout (120s), doubled for a retry of each leg. `MIN_COMMITMENT_AGE`
 * itself is read on-chain where it is enforced; this is only a preflight bound,
 * so it is intentionally over-generous rather than exact.
 */
export const SESSION_REGISTRATION_HEADROOM_SECONDS = 600

/**
 * Whether a session has enough lifetime left to see a whole registration
 * through. PURE — unlike `isSessionExpired` it never evicts, because an
 * in-flight registration must keep using its session right up to real expiry;
 * dropping it mid-cooldown would leave the reveal unsignable. Use this to gate
 * STARTING a registration, not to decide whether a session is still usable.
 */
export function hasRegistrationHeadroom(
  session: RhinestoneStoredSession,
  headroomSeconds: number = SESSION_REGISTRATION_HEADROOM_SECONDS,
): boolean {
  if (!session.validUntil) return true
  return Date.now() + headroomSeconds * 1000 <= session.validUntil * 1000
}

/** Get a non-expired session for an account and refund token, evicting it on expiry. */
export function getValidSession(
  accountAddress: Address,
  refundToken?: Address,
): RhinestoneStoredSession | null {
  const session = getSession(accountAddress, refundToken)
  if (!session) return null
  if (isSessionExpired(session)) {
    removeStoredSession(session)
    return null
  }
  return session
}

/** Get a non-expired session by owner EOA, evicting it on expiry. */
export function getValidSessionByOwner(
  ownerAddress: Address,
): RhinestoneStoredSession | null {
  const session = getSessionByOwner(ownerAddress)
  if (!session) return null
  if (isSessionExpired(session)) {
    removeSession(session.smartAccountAddress)
    return null
  }
  return session
}

export interface SessionScope {
  readonly accountAddress: Address
  readonly ownerAddress: Address
  readonly chainId: number
  /** The session's refund token. Defaults to the deployment's USDC. */
  readonly refundToken?: Address
}

/**
 * Get a non-expired session scoped to a specific HCA, verifying that it was
 * created for the SAME owner and chain before reuse.
 *
 * Sessions are keyed by `smartAccountAddress`, but an owner-keyed lookup can
 * return a session for a different HCA/chain — its scoped session is bound to a
 * different account/resolver, so reusing it would fail intent simulation. This
 * lookup pins all three identifiers; on any mismatch (or expiry) it evicts the
 * stale row and returns `null` so the caller authorizes a fresh session.
 */
export function getValidSessionForAccount(
  scope: SessionScope,
): RhinestoneStoredSession | null {
  const session = getValidSession(scope.accountAddress, scope.refundToken)
  if (!session) return null

  const ownerMatches =
    session.ownerAddress.toLowerCase() === scope.ownerAddress.toLowerCase()
  const chainMatches = session.chainId === scope.chainId
  if (!ownerMatches || !chainMatches) {
    removeStoredSession(session)
    return null
  }
  return session
}

/** `getValidSessionForAccount`, also evicting a session whose authorization the owner didn't sign. */
export async function getVerifiedSessionForAccount(
  scope: SessionScope,
): Promise<RhinestoneStoredSession | null> {
  const session = getValidSessionForAccount(scope)
  if (!session) return null
  const isOwner = await isOwnerSessionAuthorization({
    owner: session.ownerAddress,
    hashesAndChainIds: deserializeChainDigests(session.hashesAndChainIds),
    userSignature: session.authorization,
  })
  if (isOwner) return session
  removeStoredSession(session)
  return null
}
