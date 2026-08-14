/**
 * localStorage backing for an interrupted registration.
 *
 * The shared package (`@ens-apps/transaction-manager`) owns the machine-context
 * half of the record and its bigint-safe codec; this module owns the app half —
 * which label the record belongs to, and the pricing the user already confirmed
 * — plus the actual storage.
 *
 * ONE record, last-writer-wins. Starting a registration for a different label
 * overwrites the previous one: a user mid-cooldown on `alice` who goes and
 * registers `bob` has made their choice, and carrying two records would mean
 * two commitments to reconcile on every mount.
 *
 * Storage is best-effort throughout. A private-mode browser or a full quota
 * costs the user resume, not the registration — every failure degrades to "no
 * stored record" rather than throwing. (Contrast `migrationBatchJournal.ts`,
 * which DOES throw: there, losing the journal risks a double-submit.)
 */

import type {
  PersistedRegistrationRecord,
  RegistrationPersistenceAdapter,
} from '@ens-apps/transaction-manager'
import {
  parseRegistrationRecord,
  serializeRegistrationRecord,
} from '@ens-apps/transaction-manager'
import {
  type SUPPORTED_TOKEN,
  SUPPORTED_TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import * as v from 'valibot'
import type { Address } from 'viem'
import type { RegistrationPostRegistrationSetup } from '../state/registrationAutoSetup'
import type { RegistrationConfirmedData } from '../state/registrationUi.machine'

/** Bump when {@link StoredRegistrationEnvelope} changes shape. */
export const REGISTRATION_RESUME_VERSION = 1

const STORAGE_KEY = 'ens-apps:register-v2:resume:v1'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type StoredRegistration = {
  readonly label: string
  /** The machine-context half, already validated by the package codec. */
  readonly record: PersistedRegistrationRecord
  /**
   * What the user confirmed at the pricing step. Not derivable from the machine
   * context — `basePriceNumber` / `premiumPriceNumber` are display values — and
   * the UI machine needs them to render the registering screen on resume.
   */
  readonly confirmedData: RegistrationConfirmedData
  /**
   * The auto-setup opt-in (primary name / eth-record sync).
   *
   * The HCA path folds this into the reveal batch, so `context.primaryName`
   * covers it there. The EOA path runs it as separate post-registration
   * transactions off UI-machine state alone — without persisting it, an EOA
   * resume would silently drop the primary name the user asked for.
   */
  readonly postRegistrationSetup?: RegistrationPostRegistrationSetup
}

/** What the adapter reads off the parent UI machine at write time. */
export type RegistrationAppState = {
  readonly confirmedData?: RegistrationConfirmedData
  readonly postRegistrationSetup?: RegistrationPostRegistrationSetup
}

const addressSchema = v.custom<Address>(
  (input) => typeof input === 'string' && /^0x[0-9a-fA-F]{40}$/.test(input),
)

// bigints are written as decimal strings rather than reusing the package's
// `{__bigint}` envelope: there are exactly two of them here, and being explicit
// keeps this file from needing a codec of its own.
const bigintStringSchema = v.pipe(v.string(), v.regex(/^\d+$/))

const confirmedDataSchema = v.object({
  label: v.string(),
  duration: bigintStringSchema,
  ownerAddress: addressSchema,
  token: v.picklist(Object.keys(SUPPORTED_TOKENS) as SUPPORTED_TOKEN[]),
  totalPrice: bigintStringSchema,
  basePriceNumber: v.number(),
  premiumPriceNumber: v.number(),
})

const postRegistrationSetupSchema = v.object({
  primaryName: v.optional(
    v.object({
      enabled: v.boolean(),
      syncEthRecord: v.optional(v.boolean()),
    }),
  ),
})

const envelopeSchema = v.object({
  v: v.number(),
  label: v.string(),
  /** The package record, kept as its own JSON string so its codec stays authoritative. */
  record: v.string(),
  confirmedData: confirmedDataSchema,
  postRegistrationSetup: v.optional(postRegistrationSetupSchema),
})

type StoredRegistrationEnvelope = v.InferOutput<typeof envelopeSchema>

const getBrowserStorage = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const encodeConfirmedData = (
  confirmedData: RegistrationConfirmedData,
): StoredRegistrationEnvelope['confirmedData'] => ({
  label: confirmedData.label,
  duration: confirmedData.duration.toString(),
  ownerAddress: confirmedData.ownerAddress,
  token: confirmedData.token,
  totalPrice: confirmedData.totalPrice.toString(),
  basePriceNumber: confirmedData.basePriceNumber,
  premiumPriceNumber: confirmedData.premiumPriceNumber,
})

const decodeConfirmedData = (
  stored: StoredRegistrationEnvelope['confirmedData'],
): RegistrationConfirmedData => ({
  label: stored.label,
  duration: BigInt(stored.duration),
  ownerAddress: stored.ownerAddress,
  token: stored.token,
  totalPrice: BigInt(stored.totalPrice),
  basePriceNumber: stored.basePriceNumber,
  premiumPriceNumber: stored.premiumPriceNumber,
})

/**
 * Read the stored registration, if there is a usable one.
 *
 * Returns `null` for every failure mode — absent, unreadable storage, corrupt
 * JSON, stale app schema, or a package record the package itself rejected
 * (wrong version, protocol drift). Callers treat all of them the same way:
 * there is nothing to resume.
 */
export function loadStoredRegistration(
  storage: StorageLike | null = getBrowserStorage(),
): StoredRegistration | null {
  if (!storage) return null

  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const envelope = v.safeParse(envelopeSchema, parsed)
  if (!envelope.success) return null
  if (envelope.output.v !== REGISTRATION_RESUME_VERSION) return null

  const record = parseRegistrationRecord(envelope.output.record)
  if (record.isErr()) return null

  // A record whose halves disagree about the label is not something to guess
  // at — the commitment binds the label, so resuming the wrong one would
  // produce a commitment that can never be revealed.
  const context = record.value.context
  const contextLabel = context.name.replace(/\.eth$/, '')
  if (contextLabel !== envelope.output.label) return null
  if (envelope.output.confirmedData.label !== envelope.output.label) return null

  return {
    label: envelope.output.label,
    record: record.value,
    confirmedData: decodeConfirmedData(envelope.output.confirmedData),
    postRegistrationSetup: envelope.output.postRegistrationSetup,
  }
}

export function clearStoredRegistration(
  storage: StorageLike | null = getBrowserStorage(),
): void {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do: a record we cannot delete is one the preflight will
    // reject anyway, and failing here would break the flow that called us.
  }
}

/**
 * Build the adapter that `subscribeRegistrationPersistence` writes through.
 *
 * `getConfirmedData` is a callback rather than a value because the subscriber
 * fires on the child machine's snapshots, while the confirmed pricing lives on
 * the parent UI machine — the adapter reads it at write time.
 *
 * A save with no confirmed data is dropped rather than stored: a record that
 * cannot repopulate the registering screen is not resumable, and a half-record
 * would shadow whatever complete one preceded it.
 */
export function createRegistrationPersistenceAdapter(options: {
  label: string
  getAppState: () => RegistrationAppState | undefined
  storage?: StorageLike | null
}): RegistrationPersistenceAdapter {
  const storage =
    options.storage === undefined ? getBrowserStorage() : options.storage

  return {
    save(record) {
      if (!storage) return

      const appState = options.getAppState()
      if (!appState?.confirmedData) return

      const envelope: StoredRegistrationEnvelope = {
        v: REGISTRATION_RESUME_VERSION,
        label: options.label,
        record: serializeRegistrationRecord(record),
        confirmedData: encodeConfirmedData(appState.confirmedData),
        postRegistrationSetup: appState.postRegistrationSetup,
      }

      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(envelope))
      } catch {
        // Quota or private mode. The user loses resume, not the registration.
      }
    },

    load() {
      return loadStoredRegistration(storage)?.record ?? null
    },

    clear() {
      clearStoredRegistration(storage)
    },
  }
}
