import { getDestinationContracts } from '@ens-apps/smart-account'
import { err, ok, type Result } from 'neverthrow'
import * as v from 'valibot'
import type { Address, Hash, Hex } from 'viem'
import { isUserRejectionError } from '../../errors/transaction.errors'
import type { Signer } from '../../types/signer.types'
import {
  PAYMENT_TOKEN_CONTRACT,
  type TOKEN_SYMBOL,
} from './registration.actors'
import { hcaRegistrarAddress } from './registration.hca.actors'
import type { RegistrationContext } from './registration.machine'
import type { RegistrationMachineActor } from './registration.types'

/**
 * Registration persistence
 *
 * Registration state has to survive a reload: without it a user who closes the
 * tab during the commitment cooldown loses the secret and the resolver address,
 * and pays for a second commitment.
 *
 * XState's own `getPersistedSnapshot()` is NOT usable here. Two reasons:
 *
 *  - `RegistrationContext` carries live objects (`signer`, `approvalSigner`,
 *    `publicClient`) that cannot round-trip through JSON, and
 *  - XState v5 re-runs pending invoked promise actors on restore, so a snapshot
 *    taken in `submittingSetupBundle` / `submittingRhinestoneBundle` would
 *    re-submit the bundle on restore — a double charge.
 *
 * So we persist a SERIALIZABLE SUBSET instead and re-enter the machine through
 * an explicit `RESUME` event, which can only land on states that are safe to
 * start from (see `getResumeTarget`).
 */

/**
 * Structural version of {@link PersistedRegistrationContext}. Bump on any shape
 * change so older records are discarded rather than half-read.
 *
 * This covers OUR shape only; protocol drift is caught separately by the
 * fingerprint below.
 */
export const REGISTRATION_PERSISTENCE_VERSION = 1

/**
 * The serializable slice of `RegistrationContext`.
 *
 * Deliberately absent, and why:
 *
 *  - `signer` / `approvalSigner` / `publicClient` — live objects, rebuilt by
 *    the app before it dispatches `RESUME`.
 *  - `hcaSessionEnable` — rebuilt from the app's own session store.
 *  - `permit` — EIP-2612 deadline is 1 hour, and the nonce is not tracked here.
 *    A resumed run re-signs it (one wallet prompt), which is the whole cost of
 *    the common resume case.
 *  - `hcaBudget` / `hcaBudgetBreakdown` / `hcaUsdcBalance` — re-derived on
 *    resume. A stale budget would mis-size the funding permit.
 *  - `error` / `retryTarget` — resume routing is recomputed from the flow
 *    fields by `getResumeTarget`; a persisted retry target could contradict it.
 */
export type PersistedRegistrationContext = {
  chainId: number
  name: string
  duration: bigint
  selectedToken: TOKEN_SYMBOL
  tokenPrice: bigint
  signerType: Signer['type']
  accountAddress?: Address
  ownerAddress?: Address
  resolverOwnerAddress?: Address
  primaryName?: string

  // Flow state
  resolverAddress?: Address
  resolverTxId?: string
  resolverSalt?: bigint
  commitment?: { commitment: Hash; secret: Hex }
  commitmentTxId?: string
  approvalTxId?: string
  registrationTxId?: string
  /**
   * The reveal intent's orchestrator id. Lets a resumed verification ask the
   * orchestrator whether the intent is still filling or definitively dead,
   * instead of sitting out the full on-chain grace poll. Optional: records
   * written before it existed (or before the reveal) simply fall back to the
   * blind poll.
   */
  registrationIntentId?: bigint
  registerReadyTimestamp?: number
  registrationStartedAt?: number
}

export type PersistedRegistrationRecord = {
  v: number
  /** Protocol-constant fingerprint; a mismatch discards the record. */
  fingerprint: string
  /** The machine state the record was written from. */
  stage: string
  context: PersistedRegistrationContext
  updatedAt: number
}

/**
 * Storage backend for a single in-flight registration. Implementations live in
 * the consuming app (see `apps/manager` register-v2), which owns the choice of
 * localStorage vs anything else, and the keying by label.
 *
 * Every method may be sync or async; the subscriber never awaits them.
 */
export interface RegistrationPersistenceAdapter {
  save(record: PersistedRegistrationRecord): void | Promise<void>
  load():
    | PersistedRegistrationRecord
    | null
    | Promise<PersistedRegistrationRecord | null>
  clear(): void | Promise<void>
}

/**
 * Fingerprint of the protocol constants baked into a stored commitment.
 *
 * The commitment hash binds `(label, owner, secret, subregistry, resolver,
 * duration, referrer)`, so pointing the app at a different registrar deployment
 * silently invalidates every stored commitment: `commitmentAt` would read 0
 * against the new registrar and the resume would look like a failed commit.
 * Comparing the fingerprint makes that a clean discard, instead of depending on
 * someone remembering to bump the schema version.
 */
function registrationFingerprint(
  context: Pick<PersistedRegistrationContext, 'chainId' | 'signerType'>,
): string {
  return `registrar:${registrarFor(context).toLowerCase()}`
}

function registrarFor(
  context: Pick<PersistedRegistrationContext, 'chainId' | 'signerType'>,
): string {
  try {
    return context.signerType === 'rhinestone'
      ? hcaRegistrarAddress(context.chainId)
      : getDestinationContracts(context.chainId).ethRegistrar
  } catch {
    // Both lookups THROW for a chain with no manifest entry. This runs on every
    // persisted snapshot, so letting that escape would take down the
    // registration it is supposed to be protecting.
    //
    // A chain with no registrar cannot hold a commitment, so any record
    // carrying this marker is unresumable by construction — and because the
    // marker differs per chain, one written here can never be mistaken for a
    // record from a configured chain.
    return `unconfigured-chain-${context.chainId}`
  }
}

/** Reveal-side stages: the register call is already out, in some form. */
const REGISTER_STAGES = new Set([
  'registeringDomain',
  'waitingForRegistration',
  'submittingRhinestoneBundle',
  'waitingForRhinestoneBundle',
  'verifyingRegistration',
])

/**
 * The only states `RESUME` may target.
 *
 * `submitting*` and `signingFundingPermit` are absent BY DESIGN: re-entering
 * them would re-submit a bundle or re-prompt for a permit that may already be
 * in flight. Every reveal-side record instead lands on `verifyingRegistration`,
 * which reads the chain first.
 */
export type ResumeTarget =
  | 'verifyingRegistration'
  | 'validatingCommitment'
  | 'settingUpRegistration'

/**
 * Map a stored record onto the state the machine should re-enter.
 *
 * Pure and exported so the routing table can be tested without an actor.
 *
 * `stage: 'error'` carries no routing information — the flow fields say where
 * the run actually got to — so it falls through to the same checks as any
 * other stage.
 */
export function getResumeTarget(record: {
  stage: string
  context: PersistedRegistrationContext
}): ResumeTarget {
  const { stage, context } = record

  // The register call was submitted (or was being submitted when the tab
  // closed). Never re-submit: check the chain. `verifyRegistrationActor`
  // grace-polls, so an intent still filling server-side is caught.
  if (context.registrationTxId || REGISTER_STAGES.has(stage)) {
    return 'verifyingRegistration'
  }

  // A commitment only enters context once the commit request COMPLETED, so its
  // presence means there is something on-chain worth validating.
  // `validateCommitmentActor` both retries `commitmentAt` and waits out
  // MIN_COMMITMENT_AGE, which makes this a safe anchor even without
  // `registerReadyTimestamp`.
  if (context.commitment) {
    return 'validatingCommitment'
  }

  // Pre-commit, including mid-setup: nothing is on-chain that we know the
  // secret for, so start the flow over. Any resolver deployed by the abandoned
  // run is orphaned but harmless.
  return 'settingUpRegistration'
}

export function serializeRegistrationContext(
  context: RegistrationContext,
): PersistedRegistrationContext {
  return {
    chainId: context.chainId,
    name: context.name,
    duration: context.duration,
    selectedToken: context.selectedToken,
    tokenPrice: context.tokenPrice,
    // The subscriber refuses to persist a context with no signer, so the
    // fallback is unreachable in practice; it exists to keep the persisted
    // type non-optional for consumers.
    signerType: context.signer?.type ?? 'eoa',
    accountAddress: context.accountAddress,
    ownerAddress: context.ownerAddress,
    resolverOwnerAddress: context.resolverOwnerAddress,
    primaryName: context.primaryName,
    resolverAddress: context.resolverAddress,
    resolverTxId: context.resolverTxId,
    resolverSalt: context.resolverSalt,
    commitment: context.commitment,
    commitmentTxId: context.commitmentTxId,
    approvalTxId: context.approvalTxId,
    registrationTxId: context.registrationTxId,
    registrationIntentId: context.registrationIntentId,
    registerReadyTimestamp: context.registerReadyTimestamp,
    registrationStartedAt: context.registrationStartedAt,
  }
}

export function buildRegistrationRecord(
  stage: string,
  context: RegistrationContext,
  updatedAt: number,
): PersistedRegistrationRecord {
  const persisted = serializeRegistrationContext(context)

  return {
    v: REGISTRATION_PERSISTENCE_VERSION,
    fingerprint: registrationFingerprint(persisted),
    stage,
    context: persisted,
    updatedAt,
  }
}

/**
 * bigint-safe JSON codec.
 *
 * Same `{ __bigint }` envelope `helpers/transaction-persistence.ts` already
 * uses, so a record written by either path reads back the same way.
 *
 * The replacer reads the original value off its holder rather than trusting
 * the `value` argument: `JSON.stringify` runs a `toJSON` method before the
 * replacer, and an app that shims `BigInt.prototype.toJSON` (the portal emits
 * them as bare `JSON.rawJSON` numbers) would otherwise hand it a non-bigint.
 * The record was then written without envelopes, failed validation on load,
 * and read as "nothing stored": every reload restarted the registration.
 */
function bigintReplacer(this: unknown, key: string, value: unknown) {
  const original = (this as Record<string, unknown>)[key]
  return typeof original === 'bigint'
    ? { __bigint: original.toString() }
    : value
}

const bigintReviver = (_key: string, value: unknown) =>
  value && typeof value === 'object' && '__bigint' in value
    ? BigInt((value as { __bigint: string }).__bigint)
    : value

export function serializeRegistrationRecord(
  record: PersistedRegistrationRecord,
): string {
  return JSON.stringify(record, bigintReplacer)
}

const addressSchema = v.custom<Address>(
  (input) => typeof input === 'string' && /^0x[0-9a-fA-F]{40}$/.test(input),
)
const hashSchema = v.custom<Hash>(
  (input) => typeof input === 'string' && /^0x[0-9a-fA-F]{64}$/.test(input),
)
const hexSchema = v.custom<Hex>(
  (input) => typeof input === 'string' && /^0x[0-9a-fA-F]*$/.test(input),
)

const persistedContextSchema = v.object({
  chainId: v.number(),
  name: v.string(),
  duration: v.bigint(),
  // Derived from the payment-token table so adding a token cannot silently
  // invalidate records.
  selectedToken: v.picklist(
    Object.keys(PAYMENT_TOKEN_CONTRACT) as TOKEN_SYMBOL[],
  ),
  tokenPrice: v.bigint(),
  signerType: v.picklist(['eoa', 'rhinestone']),
  accountAddress: v.optional(addressSchema),
  ownerAddress: v.optional(addressSchema),
  resolverOwnerAddress: v.optional(addressSchema),
  primaryName: v.optional(v.string()),
  resolverAddress: v.optional(addressSchema),
  resolverTxId: v.optional(v.string()),
  resolverSalt: v.optional(v.bigint()),
  commitment: v.optional(
    v.object({ commitment: hashSchema, secret: hexSchema }),
  ),
  commitmentTxId: v.optional(v.string()),
  approvalTxId: v.optional(v.string()),
  registrationTxId: v.optional(v.string()),
  registrationIntentId: v.optional(v.bigint()),
  registerReadyTimestamp: v.optional(v.number()),
  registrationStartedAt: v.optional(v.number()),
})

const persistedRecordSchema = v.object({
  v: v.number(),
  fingerprint: v.string(),
  stage: v.string(),
  context: persistedContextSchema,
  updatedAt: v.number(),
})

/**
 * Read a stored record back.
 *
 * Corrupt JSON, a stale schema version, a shape mismatch and protocol drift all
 * collapse to a single `Err`, because callers do the same thing with each of
 * them: discard the record and start the registration over.
 */
export function parseRegistrationRecord(
  raw: string,
): Result<PersistedRegistrationRecord, Error> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw, bigintReviver)
  } catch (error) {
    return err(
      new Error(`Registration record is not valid JSON: ${String(error)}`),
    )
  }

  const result = v.safeParse(persistedRecordSchema, parsed)
  if (!result.success) {
    return err(
      new Error(
        `Registration record failed validation: ${v.summarize(result.issues)}`,
      ),
    )
  }

  const record = result.output as PersistedRegistrationRecord

  if (record.v !== REGISTRATION_PERSISTENCE_VERSION) {
    return err(
      new Error(
        `Registration record schema version ${record.v} != ${REGISTRATION_PERSISTENCE_VERSION}`,
      ),
    )
  }

  const expected = registrationFingerprint(record.context)
  if (record.fingerprint !== expected) {
    return err(
      new Error(
        `Registration record fingerprint ${record.fingerprint} != ${expected}`,
      ),
    )
  }

  return ok(record)
}

/** Terminal-ish states that mean there is nothing left to resume. */
const CLEARING_STAGES = new Set(['idle', 'success'])

/**
 * A run that failed because the user declined a wallet request was abandoned,
 * not interrupted. Resuming it on the next load would put the prompt they just
 * refused straight back in front of them, so it is cleared like a cancel and a
 * reload lands on pricing instead. On the EOA path this can drop a commitment
 * that is already on-chain; the user chose to stop, and the cost is the commit
 * gas.
 */
const isDeclinedRun = (stage: string, context: RegistrationContext) =>
  stage === 'error' && isUserRejectionError(context.error)

/**
 * Mirror an actor's progress into `adapter`.
 *
 * Writes on every stage that could be resumed, and clears on `success` (the
 * name is registered), on `idle` (the flow was cancelled, or never started)
 * and on an `error` the user caused by declining a wallet request. Retrying
 * from that error re-enters a live stage, which writes the record again. A
 * SUSPENDed run also lands in `idle` but keeps its record, as a closed tab
 * would.
 *
 * Storage failures are swallowed: a full quota must never take down a
 * registration that is otherwise fine.
 *
 * @returns an unsubscribe function
 */
export function subscribeRegistrationPersistence(
  actor: RegistrationMachineActor,
  adapter: RegistrationPersistenceAdapter,
  options: { onError?: (error: unknown) => void } = {},
): () => void {
  const onError =
    options.onError ??
    ((error: unknown) => {
      console.warn('⚠️ [REGISTRATION] Persistence write failed:', error)
    })

  const runSafely = (run: () => void | Promise<void>) => {
    try {
      const result = run()
      if (result instanceof Promise) result.catch(onError)
    } catch (error) {
      onError(error)
    }
  }

  // Payload of the last write, minus `updatedAt`. Snapshots fire far more often
  // than the persisted fields actually change, and every duplicate would be a
  // synchronous localStorage write on the app's main thread.
  let lastPayload: string | null = null

  const subscription = actor.subscribe((snapshot) => {
    const stage = String(snapshot.value)

    // Suspended because its wallet went away: interrupted, not cancelled. Keep
    // the record exactly as closing the tab would, so that wallet can resume
    // it, and let the next run's first write through.
    if (snapshot.context.suspended) {
      lastPayload = null
      return
    }

    if (CLEARING_STAGES.has(stage) || isDeclinedRun(stage, snapshot.context)) {
      if (lastPayload === null) return
      lastPayload = null
      runSafely(() => adapter.clear())
      return
    }

    // Nothing is resumable without knowing which signer produced the run — it
    // selects the registrar the commitment lives on.
    if (!snapshot.context.signer) return

    // Building and serializing the record runs inside the guard too, not just
    // the adapter call: this callback executes on the actor's own subscription,
    // so anything thrown here would surface as an actor error and kill the
    // registration. Persistence is never allowed to do that.
    runSafely(() => {
      const record = buildRegistrationRecord(stage, snapshot.context, 0)
      const payload = serializeRegistrationRecord(record)
      if (payload === lastPayload) return

      lastPayload = payload
      return adapter.save({ ...record, updatedAt: Date.now() })
    })
  })

  return () => {
    subscription.unsubscribe()
  }
}
