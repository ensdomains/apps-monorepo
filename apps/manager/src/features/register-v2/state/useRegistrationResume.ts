/**
 * Resume an interrupted registration on mount.
 *
 * The pure reads — stored record, commitment age, price re-quote — run through
 * TanStack Query (`getResumeAssessmentQueryOptions`), which owns caching,
 * retries and deduplication. This hook owns the imperative tail: the identity
 * and session gates and the one-shot `registration.resume` dispatch, kept
 * outside the query lifecycle so a refetch can never replay a wallet prompt.
 *
 * Auto-resumes rather than asking: the user navigated back to
 * `/register/$name` deliberately, and a confirmation prompt in front of a flow
 * they already paid to start is friction without a decision behind it.
 */

import { msg } from '@lingui/core/macro'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Address } from 'viem'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { needsSessionBeforeRegistration } from '@/lib/smart-account/sessionGate'
import { translateMessage } from '@/utils/i18n/translateMessage'
import { getResumeAssessmentQueryOptions } from '../data/queries/resumeAssessment.query'
import {
  isResumeOwner,
  type ResumeAssessment,
  type ResumeStaleReason,
} from '../service/assessResumableRegistration'
import {
  clearStoredRegistration,
  loadStoredRegistration,
} from '../service/registrationPersistence'
import type { RegistrationV2UiActor } from './registrationUi.machine'

const resumingMessage = msg`Resuming your registration.`
const expiredMessage = msg`Your previous registration attempt expired. Starting over.`

export type RegistrationResumeState =
  /**
   * This name has a stored record and the resume has not decided yet; the
   * wallet may not have finished restoring. The page holds pricing back
   * meanwhile, because it may be about to hand over to the registering screen.
   */
  | { readonly status: 'checking' }
  /** Nothing to do; render the normal pricing flow. */
  | { readonly status: 'idle' }
  /** A record exists but belongs to another wallet. */
  | { readonly status: 'wrong-wallet'; readonly expectedOwner: string }
  /** A record existed and was discarded; tell the user why. */
  | { readonly status: 'discarded'; readonly reason: ResumeStaleReason }
  /** `registration.resume` has been dispatched. */
  | { readonly status: 'resumed' }

const CHECKING: RegistrationResumeState = { status: 'checking' }
const IDLE: RegistrationResumeState = { status: 'idle' }

function discardStaleRecord(
  label: string,
  reason: ResumeStaleReason,
): RegistrationResumeState {
  clearStoredRegistration()

  // Only the expiry gets a notice: it is the one stale reason where the user
  // did something (paid for a commitment) whose silent disappearance would
  // read as a bug. The rest are technical mismatches for which a quiet
  // restart is the correct surface.
  if (reason === 'commitment-expired') {
    toast(translateMessage(expiredMessage), {
      id: `registration-resume-${label}`,
      position: 'bottom-right',
    })
  }

  return { status: 'discarded', reason }
}

type SettledDecision =
  /** Settle on a state; `latch` marks the decision final for this label. */
  | {
      readonly kind: 'state'
      readonly state: RegistrationResumeState
      readonly latch: boolean
    }
  /** A live resumable record owned by the connected wallet — go dispatch. */
  | {
      readonly kind: 'dispatch'
      readonly verdict: Extract<ResumeAssessment, { status: 'resumable' }>
    }

function decideFromVerdict(
  verdict: ResumeAssessment,
  label: string,
  connectedOwner: Address | null | undefined,
): SettledDecision {
  if (verdict.status === 'none') {
    return { kind: 'state', state: { status: 'idle' }, latch: true }
  }

  if (verdict.status === 'stale') {
    // A record for another name is not dead — the user merely opened a
    // different label's page. Clearing here would delete a paid commitment for
    // the OTHER name; leave it for the run it belongs to. If a registration
    // actually starts on this page, the write path overwrites it anyway.
    if (verdict.reason === 'label-mismatch') {
      return { kind: 'state', state: { status: 'idle' }, latch: true }
    }

    return {
      kind: 'state',
      state: discardStaleRecord(label, verdict.reason),
      latch: true,
    }
  }

  const recordOwner = verdict.stored.record.context.ownerAddress

  if (!isResumeOwner(recordOwner, connectedOwner)) {
    // Deliberately un-latched: the user can connect the right wallet, which
    // re-keys the assessment and lets the resume pick up when they do.
    return {
      kind: 'state',
      state: { status: 'wrong-wallet', expectedOwner: recordOwner ?? '' },
      latch: false,
    }
  }

  return { kind: 'dispatch', verdict }
}

/**
 * The imperative tail of a resume: the session gate, then the one-shot
 * dispatch. Returns the state the hook should settle on, or null when the
 * effect was cleaned up mid-flight and nothing may be reported.
 */
async function enableSessionAndDispatch(params: {
  verdict: Extract<ResumeAssessment, { status: 'resumable' }>
  label: string
  account: ReturnType<typeof useSmartAccountContext>
  uiActor: RegistrationV2UiActor
  isCancelled: () => boolean
}): Promise<RegistrationResumeState | null> {
  const { verdict, label, account, uiActor, isCancelled } = params

  // A session that expired while the tab was closed has to be re-enabled
  // before the reveal can be signed. `needsSessionBeforeRegistration` also
  // rejects one with too little headroom left to outlive the commitment
  // cooldown — the case that would otherwise strand a paid commitment with an
  // unsignable reveal.
  if (needsSessionBeforeRegistration(account)) {
    const signer = await account.enableSession()
    if (!signer) {
      // Rejected or failed. Leave the record in place and stay un-latched so
      // a reconnect can still resume.
      return isCancelled() ? null : { status: 'idle' }
    }
  }

  // Prompt-free in the common case: rebuilt from the stored authorization
  // signature, with no wallet interaction.
  const hcaSessionEnable = await account.getSessionEnablePayload()

  if (isCancelled()) return null

  uiActor.send({
    type: 'registration.resume',
    label,
    confirmedData: verdict.confirmedData,
    record: verdict.stored.record,
    postRegistrationSetup: verdict.stored.postRegistrationSetup,
    account,
    hcaSessionEnable,
  })
  toast(translateMessage(resumingMessage), {
    id: `registration-resume-${label}`,
    position: 'bottom-right',
  })

  return { status: 'resumed' }
}

export function useRegistrationResume(params: {
  label: string
  uiActor: RegistrationV2UiActor
  /** Set false to disable resume entirely (rollout switch). */
  enabled?: boolean
}): RegistrationResumeState {
  const { label, uiActor, enabled = true } = params
  const account = useSmartAccountContext()
  const { hasInitialized, ownerAddress } = account

  // A decision, tagged with the label it was made for. The route keeps the
  // provider mounted across a label change, so an untagged state would report
  // one name's verdict (its wrong-wallet banner, or its lack of a hold) on the
  // next name until that name's own assessment lands.
  const [settled, setSettled] = useState<{
    readonly label: string
    readonly state: RegistrationResumeState
  } | null>(null)

  // Whether this name has a stored record at all. It is one synchronous
  // localStorage read, so the FIRST render already knows whether a resume could
  // be about to take the page over. Only then does the page wait; every other
  // name renders pricing straight away.
  const hasStoredRecord = useMemo(
    () => enabled && loadStoredRegistration()?.label === label,
    [enabled, label],
  )

  // One decision per label. Without this latch the effect re-runs on every
  // account re-render and could dispatch a second resume into a flow that is
  // already running.
  const decidedForLabel = useRef<string | null>(null)

  // The imperative tail reads the account through a ref because the context
  // object is re-created whenever any of its state flips — `enableSession()`
  // itself flips `isEnablingSession`. An effect keyed on the object would
  // cancel and restart the tail mid-prompt, calling `enableSession()` a second
  // time while the first is still waiting on the wallet. The effect keys on
  // the primitives that change a DECISION instead.
  const accountRef = useRef(account)
  useEffect(() => {
    accountRef.current = account
  })

  const assessment = useQuery({
    ...getResumeAssessmentQueryOptions({
      label,
      ownerAddress: account.ownerAddress,
      signerType: account.signer?.type,
    }),
    // The wallet restores asynchronously. Assessing before it has settled
    // would run the signer-mode check against a signer that isn't there yet —
    // and deciding "wrong wallet" that early would show the banner to the very
    // user who owns the record.
    enabled: enabled && account.hasInitialized,
  })

  const verdict = assessment.data
  const assessmentError = assessment.isError ? assessment.error : null

  useEffect(() => {
    if (!enabled) {
      setSettled({ label, state: IDLE })
      return
    }

    if (decidedForLabel.current === label) return
    if (!hasInitialized) return

    if (assessmentError) {
      // The query has already retried. Stay un-latched and leave the record
      // alone: connecting a wallet re-keys the query, which is the recovery
      // path — a resumable record must survive a transient RPC failure.
      console.warn('⚠️ [REGISTRATION] Resume check failed:', assessmentError)
      setSettled({ label, state: IDLE })
      return
    }

    // Still fetching — stay at 'checking'.
    if (!verdict) return

    const decision = decideFromVerdict(verdict, label, ownerAddress)

    if (decision.kind === 'state') {
      if (decision.latch) decidedForLabel.current = label
      setSettled({ label, state: decision.state })
      return
    }

    let cancelled = false

    enableSessionAndDispatch({
      verdict: decision.verdict,
      label,
      account: accountRef.current,
      uiActor,
      isCancelled: () => cancelled,
    })
      .then((next) => {
        if (!next) return
        if (next.status === 'resumed') decidedForLabel.current = label
        setSettled({ label, state: next })
      })
      .catch((error: unknown) => {
        if (cancelled) return

        // `enableSession()` and `getSessionEnablePayload()` can both reject.
        // Without this the resume would sit at `checking` forever on an
        // unhandled rejection — the record intact but never picked up. Stay
        // un-latched so a reconnect or a retried session enable gets another
        // go, and leave the record alone: it is still valid.
        console.warn('⚠️ [REGISTRATION] Resume check failed:', error)
        setSettled({ label, state: IDLE })
      })

    return () => {
      cancelled = true
    }
  }, [
    enabled,
    label,
    uiActor,
    verdict,
    assessmentError,
    hasInitialized,
    ownerAddress,
  ])

  if (settled?.label === label) return settled.state
  return hasStoredRecord ? CHECKING : IDLE
}
