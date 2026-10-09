/**
 * Resume preflight.
 *
 * Decides whether a stored registration is still worth re-entering, BEFORE the
 * machine is touched. Two things make this necessary rather than optional:
 *
 *  - `validateCommitmentActor` checks that a commitment exists and waits out
 *    MIN_COMMITMENT_AGE, but it does NOT check MAX_COMMITMENT_AGE. A commitment
 *    older than that window passes validation and then `register` reverts with
 *    an opaque `CommitmentTooOld` — after the user has sat through a cooldown.
 *  - The stored `tokenPrice` was quoted before the user left. The temporary
 *    premium decays continuously, so a resumed run must re-quote or it sizes the
 *    funding permit against a price that no longer exists.
 *
 * Every outcome is a verdict, not an exception: "cannot read the chain" and
 * "record is stale" are both normal, and the caller has a defined response to
 * each. That is why this returns a discriminated union instead of a Result.
 */

import {
  getDestinationContracts,
  readCommitmentAges,
} from '@ens-apps/smart-account'
import { type Address, type PublicClient, parseAbi } from 'viem'
import { type SUPPORTED_TOKEN, TOKENS } from '@/lib/tokens'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { getQueryClient } from '@/utils/router/root-context'
import {
  getRegisterPrice,
  getRegisterPriceQueryOptions,
} from '../data/queries/pricing.query'
import type { RegistrationConfirmedData } from '../state/registrationUi.machine'
import {
  isFailedRegistrationRecord,
  loadStoredRegistration,
  type StoredRegistration,
  type StoredRegistrationKey,
  storedRegistrationKey,
} from './registrationPersistence'

const commitmentAtAbi = parseAbi([
  'function commitmentAt(bytes32 commitment) view returns (uint64)',
])

/**
 * The registrar a RECORD's commitment lives on — mirrors `registrarFor` in the
 * persistence layer. Both signer modes settle on the chain's one registrar, so
 * this is keyed by the RECORD's chain rather than the live one: reading a
 * record's own deployment is what keeps the preflight honest across a redeploy,
 * where the current registrar would report `commitmentAt == 0` for every older
 * record and silently disable the expiry check.
 */
function registrarForRecord(chainId: number): Address {
  return getDestinationContracts(chainId).ethRegistrar
}

export type ResumeStaleReason =
  /** The record belongs to a different name than the one being viewed. */
  | 'label-mismatch'
  /** The record was written against a different chain. */
  | 'chain-mismatch'
  /** The app switched between the EOA and HCA paths since the record was written. */
  | 'signer-mode-mismatch'
  /** Past MAX_COMMITMENT_AGE — reveal would revert `CommitmentTooOld`. */
  | 'commitment-expired'
  /** A finished run whose record outlived its own cleanup. */
  | 'already-finished'
  /**
   * A run that failed before it held a commitment, so there is no secret to
   * continue from. It starts over.
   */
  | 'failed-before-commit'

type ContinuableRegistration = {
  readonly stored: StoredRegistration
  /**
   * The stored `confirmedData` with pricing refreshed at preflight time.
   * Feeds both the registering screen and the machine's `tokenPrice`.
   */
  readonly confirmedData: RegistrationConfirmedData
  /** True when the re-quote failed and the stored price was kept. */
  readonly priceIsStale: boolean
}

export type ResumeAssessment =
  | { readonly status: 'none' }
  | {
      readonly status: 'stale'
      readonly reason: ResumeStaleReason
      /**
       * The stored write this verdict is about. A discard clears only that
       * write: the chain reads take long enough for another tab to have
       * replaced it, and the newer record holds the only copy of its secret.
       */
      readonly run: StoredRegistrationKey
    }
  | ({ readonly status: 'resumable' } & ContinuableRegistration)
  /**
   * A run that failed holding a commitment. It goes back on the failure screen
   * rather than resuming, and continues only when the user presses Try Again.
   *
   * The record is passed on as stored, register ids included. A register that
   * was sent may have landed or still be filling, and the commitment it
   * consumed then reads like one that never landed. With the ids, the resume
   * starts at `verifyingRegistration`, which checks that register before
   * anything is revealed again; without them it would revalidate the
   * commitment and fail a name the user already owns.
   */
  | ({ readonly status: 'failed' } & ContinuableRegistration)

/**
 * Chain time, not wall-clock: `commitmentAt` is a block timestamp, and the e2e
 * harness warps the chain clock to exercise expiry. Comparing against
 * `Date.now()` would make that test unwritable and drift on a slow chain.
 */
async function readCommitmentAge(params: {
  publicClient: PublicClient
  chainId: number
  commitment: `0x${string}`
  registrar: Address
}): Promise<{ ageSeconds: bigint; maxAgeSeconds: bigint } | null> {
  const [committedAt, ages, block] = await Promise.all([
    params.publicClient.readContract({
      address: params.registrar,
      abi: commitmentAtAbi,
      functionName: 'commitmentAt',
      args: [params.commitment],
    }),
    // The shared per-deployment read; the age windows are immutables, so this
    // must ask the record's own registrar rather than hardcode one.
    readCommitmentAges({
      publicClient: params.publicClient,
      chainId: params.chainId,
      registrar: params.registrar,
    }),
    params.publicClient.getBlock(),
  ])

  // Not recorded. Either the commit is still filling or it failed outright —
  // `validatingCommitment` retries for ~15s and then routes to a signer-aware
  // retry, so it is better placed to tell those apart than we are.
  if (committedAt === 0n) return null

  return {
    ageSeconds: block.timestamp - committedAt,
    maxAgeSeconds: ages.maxCommitmentAge,
  }
}

/**
 * Re-quote through the SAME query the pricing screen uses, so the read is
 * cached and deduped against it rather than being a second raw contract call
 * for the same label/duration/token.
 *
 * `resultQueryOptions` unwraps the `Result` — the value on Ok, a throw on Err —
 * so this catches rather than inspecting a `Result`. Falls back to calling the
 * service directly when no query client is available (tests, and any caller
 * outside the router tree).
 */
async function fetchRegisterPrice(
  label: string,
  durationSeconds: number,
  token: SUPPORTED_TOKEN,
): Promise<{ basePrice: bigint; premium: bigint }> {
  const queryClient = getQueryClient()

  if (!queryClient) {
    const quote = await getRegisterPrice(label, durationSeconds, token)
    if (quote.isErr()) throw quote.error
    return quote.value
  }

  return queryClient.fetchQuery(
    getRegisterPriceQueryOptions(label, durationSeconds, token),
  )
}

async function requoteConfirmedData(
  stored: StoredRegistration,
): Promise<{ confirmedData: RegistrationConfirmedData; stale: boolean }> {
  const { confirmedData } = stored

  try {
    const { basePrice, premium } = await fetchRegisterPrice(
      stored.label,
      Number(confirmedData.duration),
      confirmedData.token as SUPPORTED_TOKEN,
    )
    const decimals = TOKENS[confirmedData.token].decimals

    return {
      stale: false,
      confirmedData: {
        ...confirmedData,
        totalPrice: basePrice + premium,
        basePriceNumber: decimalBigintToNumber(basePrice, decimals),
        premiumPriceNumber: decimalBigintToNumber(premium, decimals),
      },
    }
  } catch {
    // Keep the stored price rather than blocking resume. The registrar pulls
    // the LIVE price at settlement either way; a stale quote only risks an
    // under-sized permit, which surfaces as a normal retryable failure.
    return { confirmedData, stale: true }
  }
}

export async function assessResumableRegistration(params: {
  /** The label the user is currently looking at. */
  readonly label: string
  readonly chainId: number
  readonly publicClient: PublicClient
  /**
   * The LIVE signer's type. `VITE_FF_USE_EOA` can flip between the run that
   * wrote the record and the one resuming it (it takes effect on redeploy), and
   * the two paths commit against different registrars.
   */
  readonly signerType?: 'eoa' | 'rhinestone'
  /** Injectable for tests; defaults to the real localStorage record. */
  readonly stored?: StoredRegistration | null
}): Promise<ResumeAssessment> {
  const stored =
    params.stored === undefined ? loadStoredRegistration() : params.stored

  if (!stored) return { status: 'none' }

  const run = storedRegistrationKey(stored)
  const stale = (reason: ResumeStaleReason): ResumeAssessment => ({
    status: 'stale',
    reason,
    run,
  })

  if (stored.label !== params.label) return stale('label-mismatch')

  if (stored.record.context.chainId !== params.chainId) {
    return stale('chain-mismatch')
  }

  // Resuming across a signer-mode flip cannot be made safe. `RESUME` replaces
  // the stored `signerType` with the live signer, and every signer-aware branch
  // downstream — which registrar `validatingCommitment` reads, which one
  // `verifyingRegistration` checks, whether the reveal is a batch or a bare
  // register — would then be evaluated against a commitment made under the
  // other mode. Discard instead: one restarted registration beats a paid
  // commitment stranded behind an unsignable reveal.
  //
  // The two registrars happen to be the same contract on Sepolia today, so this
  // is currently latent — which is exactly why it needs a guard rather than an
  // assumption.
  if (
    params.signerType &&
    stored.record.context.signerType !== params.signerType
  ) {
    return stale('signer-mode-mismatch')
  }

  // The subscriber clears on `success`/`idle`, so seeing one here means the tab
  // died between the write and the clear. Nothing left to do but tidy up.
  if (stored.record.stage === 'success' || stored.record.stage === 'idle') {
    return stale('already-finished')
  }

  const isFailedRun = isFailedRegistrationRecord(stored.record)

  const staleReason = await commitmentStaleReason({
    publicClient: params.publicClient,
    chainId: params.chainId,
    commitment: stored.record.context.commitment?.commitment,
    isFailedRun,
  })
  if (staleReason) return stale(staleReason)

  const requoted = await requoteConfirmedData(stored)

  return {
    status: isFailedRun ? 'failed' : 'resumable',
    stored,
    confirmedData: requoted.confirmedData,
    priceIsStale: requoted.stale,
  }
}

/**
 * Why a stored run can no longer continue from its commitment, or `null` when
 * it can.
 */
async function commitmentStaleReason(params: {
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly commitment: `0x${string}` | undefined
  readonly isFailedRun: boolean
}): Promise<ResumeStaleReason | null> {
  // A live run that has not committed yet simply resumes into its commit. A
  // failed one has no secret to continue from.
  if (!params.commitment) {
    return params.isFailedRun ? 'failed-before-commit' : null
  }

  try {
    const age = await readCommitmentAge({
      publicClient: params.publicClient,
      chainId: params.chainId,
      commitment: params.commitment,
      registrar: registrarForRecord(params.chainId),
    })

    // Not recorded, which proves nothing either way. A commit can land after
    // its run has failed: `validatingCommitment` gives up after ~12s, and a
    // relayed commit can fill after a reported failure. A register that went
    // out consumes the commitment, so it also reads as not recorded once it
    // lands. Discarding the record here would lose the only copy of the
    // secret, or the ids that find that register. Kept, it is checked again
    // before anything reveals.
    if (!age) return null

    // `>=`: the reveal window is the OPEN interval (commit+min, commit+max),
    // and the reveal necessarily runs later than this assessment — a
    // commitment at the boundary is already doomed to `CommitmentTooOld`.
    return age.ageSeconds >= age.maxAgeSeconds ? 'commitment-expired' : null
  } catch {
    // An RPC blip must not discard a commitment the user paid for. Resuming
    // is recoverable (a genuinely expired commitment reverts and the user
    // restarts); discarding is not.
    return null
  }
}

/** Owner check, kept separate so the hook can gate on wallet readiness. */
export function isResumeOwner(
  recordOwner: Address | undefined,
  connectedOwner: Address | null | undefined,
): boolean {
  if (!recordOwner || !connectedOwner) return false
  return recordOwner.toLowerCase() === connectedOwner.toLowerCase()
}
