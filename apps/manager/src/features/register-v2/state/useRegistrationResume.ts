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
 *
 * A run that had already FAILED is the exception. It comes back on the failure
 * screen instead, and continues from its commitment only on Try Again: a
 * failed register does not mean a failed commitment, but replaying the failure
 * unasked is not a resume either.
 */

import { msg } from '@lingui/core/macro'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
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
  clearStoredRegistrationIfUnchanged,
  loadStoredRegistration,
  type StoredRegistrationKey,
  storedRegistrationKey,
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
  /**
   * A record exists but a different wallet is connected. It is kept for its
   * owner and resumes when that wallet reconnects; until then the page shows
   * nothing of it, since it is not this wallet's registration.
   */
  | { readonly status: 'wrong-wallet' }
  /** A record exists and no wallet is connected: say which one resumes it. */
  | { readonly status: 'no-wallet'; readonly expectedOwner: string }
  /** A record existed and was discarded; tell the user why. */
  | { readonly status: 'discarded'; readonly reason: ResumeStaleReason }
  /** `registration.resume` has been dispatched. */
  | { readonly status: 'resumed' }
  /**
   * A run that failed with its commitment on-chain is back on the failure
   * screen. Nothing re-runs on load: `retry` continues it from that commitment,
   * through the same session gate and dispatch as a resume.
   */
  | { readonly status: 'failed'; readonly retry: () => void }

type ContinuableVerdict = Extract<
  ResumeAssessment,
  { status: 'resumable' | 'failed' }
>

const CHECKING: RegistrationResumeState = { status: 'checking' }
const IDLE: RegistrationResumeState = { status: 'idle' }

/**
 * How long a disconnect must last before it stops a live run. Long enough to
 * ride out a connector reporting a disconnect while it reconnects; short
 * enough that the registering screen does not linger with no wallet behind it.
 */
export const DISCONNECT_GRACE_MS = 2_000

function discardStaleRecord(
  label: string,
  verdict: Extract<ResumeAssessment, { status: 'stale' }>,
): RegistrationResumeState {
  const { reason } = verdict
  // Only the write that was assessed: another tab may have replaced it while
  // the chain was read, and its record holds the only copy of its secret.
  clearStoredRegistrationIfUnchanged(verdict.run)

  // Only the expiry gets a notice: it is the one stale reason where the user
  // did something (paid for a commitment) whose silent disappearance would
  // read as a bug. The rest are technical mismatches, or a run that failed
  // before it paid for anything, for which a quiet restart is the correct
  // surface.
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
  /** A failed run owned by the connected wallet — show it, run nothing. */
  | {
      readonly kind: 'restore-failure'
      readonly verdict: Extract<ResumeAssessment, { status: 'failed' }>
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
      state: discardStaleRecord(label, verdict),
      latch: true,
    }
  }

  const recordOwner = verdict.stored.record.context.ownerAddress

  if (!isResumeOwner(recordOwner, connectedOwner)) {
    // Deliberately un-latched: connecting the owner re-keys the assessment and
    // lets the resume pick up when it does.
    return {
      kind: 'state',
      state: connectedOwner
        ? { status: 'wrong-wallet' }
        : { status: 'no-wallet', expectedOwner: recordOwner ?? '' },
      latch: false,
    }
  }

  return verdict.status === 'failed'
    ? { kind: 'restore-failure', verdict }
    : { kind: 'dispatch', verdict }
}

/**
 * The imperative tail of a resume: the session gate, then the one-shot
 * dispatch. Returns the state the hook should settle on, or null when the
 * effect was cleaned up mid-flight and nothing may be reported.
 */
async function enableSessionAndDispatch(params: {
  verdict: ContinuableVerdict
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
  const enabled = needsSessionBeforeRegistration(account)
    ? await account.enableSession()
    : undefined
  if (enabled === null) {
    // Rejected or failed. Leave the record in place and stay un-latched so
    // a reconnect can still resume.
    return isCancelled() ? null : { status: 'idle' }
  }

  // A session enabled just now is used as returned: `account` was captured
  // before the prompt, so its signer and payload still describe the session
  // this one replaced. Otherwise the payload is prompt-free, rebuilt from the
  // stored authorization signature.
  const hcaSessionEnable =
    enabled?.hcaSessionEnable ?? (await account.getSessionEnablePayload())

  if (isCancelled()) return null

  uiActor.send({
    type: 'registration.resume',
    label,
    confirmedData: verdict.confirmedData,
    record: verdict.stored.record,
    postRegistrationSetup: verdict.stored.postRegistrationSetup,
    account: enabled ? { ...account, signer: enabled.signer } : account,
    hcaSessionEnable,
  })
  toast(translateMessage(resumingMessage), {
    id: `registration-resume-${label}`,
    position: 'bottom-right',
  })

  return { status: 'resumed' }
}

/**
 * Try Again on a restored failure. Returns the state to settle on, or null to
 * leave the failure screen as it is, with Try Again still on it.
 *
 * Re-assessed rather than acting on the verdict the page loaded with: while
 * the failure screen sat open, the commitment may have expired, or another
 * tab may have finished, discarded or replaced the stored run.
 */
/** The stored write a verdict is about; none when nothing was stored. */
const assessedRun = (
  verdict: ResumeAssessment,
): StoredRegistrationKey | undefined =>
  match(verdict)
    .with({ status: 'none' }, () => undefined)
    .with({ status: 'stale' }, ({ run }) => run)
    .otherwise(({ stored }) => storedRegistrationKey(stored))

const isSameRun = (
  a: StoredRegistrationKey | undefined,
  b: StoredRegistrationKey | undefined,
): boolean => !!a && !!b && a.label === b.label && a.updatedAt === b.updatedAt

async function continueFailedRun(params: {
  label: string
  account: ReturnType<typeof useSmartAccountContext>
  uiActor: RegistrationV2UiActor
  assess: () => Promise<ResumeAssessment>
}): Promise<RegistrationResumeState | null> {
  const { label, account, uiActor } = params

  // The assessment and the session prompt both leave time to move on: Back to
  // Quote, another name, another wallet. Only the screen Try Again was
  // pressed on may be continued.
  const isCancelled = () =>
    uiActor.getSnapshot().context.restoredRun?.label !== label

  const verdict = await params.assess()
  if (isCancelled()) return null

  // The stored run is gone, or another tab has replaced it with a run of its
  // own (resumed, restarted, or finished). Either way the failure on screen is
  // over, and the newer record is not this screen's to resume or discard: back
  // to pricing, storage untouched.
  const restored = uiActor.getSnapshot().context.restoredRun
  if (!isSameRun(assessedRun(verdict), restored)) {
    uiActor.send({ type: 'cancel' })
    return IDLE
  }

  const decision = decideFromVerdict(verdict, label, account.ownerAddress)

  if (decision.kind === 'state') {
    // Nothing left to continue from: `decideFromVerdict` has discarded the
    // stale record. A run another wallet owns stays put, with Try Again on
    // screen for when its owner reconnects.
    if (decision.state.status !== 'discarded') return null
    uiActor.send({ type: 'cancel' })
    return decision.state
  }

  const next = await enableSessionAndDispatch({
    verdict: decision.verdict,
    label,
    account,
    uiActor,
    isCancelled,
  })

  // The machine can still refuse the run (the wallet busy in another tab, an
  // account not ready), which leaves the restored failure on screen. Try
  // Again stays routed here then, so the next press re-checks.
  const isRefused = uiActor.getSnapshot().context.restoredRun !== undefined
  return next?.status === 'resumed' && !isRefused ? next : null
}

export function useRegistrationResume(params: {
  label: string
  uiActor: RegistrationV2UiActor
  /** Set false to disable resume entirely (rollout switch). */
  enabled?: boolean
  /**
   * Owner of the run the UI machine is driving, while that run can still be
   * suspended (see `getSuspendableRunOwner`).
   */
  suspendableRunOwner?: Address
}): RegistrationResumeState {
  const { label, uiActor, enabled = true, suspendableRunOwner } = params
  const account = useSmartAccountContext()
  const { hasInitialized, ownerAddress } = account
  const { isDisconnected: isWalletDisconnected } = useConnection()

  // A decision, tagged with the label it was made for. The route keeps the
  // provider mounted across a label change, so an untagged state would report
  // one name's verdict (its banner, or its lack of a hold) on the next name
  // until that name's own assessment lands.
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
  // Read through a ref for the same reason: Try Again is handed to the decision
  // below, which must not re-run (and re-prompt) because a dependency changed
  // identity.
  const queryClient = useQueryClient()
  const queryClientRef = useRef(queryClient)
  useEffect(() => {
    accountRef.current = account
    queryClientRef.current = queryClient
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

  // Bumped by a suspend so the decision below runs again even when none of its
  // inputs changed, e.g. a verdict fetched during the disconnect grace period.
  const [suspensions, countSuspension] = useReducer((n: number) => n + 1, 0)

  const isRetrying = useRef(false)

  // Try Again on a restored failure.
  const retryFailedRun = useCallback(() => {
    if (isRetrying.current) return
    isRetrying.current = true
    const current = accountRef.current

    continueFailedRun({
      label,
      account: current,
      uiActor,
      assess: () =>
        queryClientRef.current.fetchQuery({
          ...getResumeAssessmentQueryOptions({
            label,
            ownerAddress: current.ownerAddress,
            signerType: current.signer?.type,
          }),
          staleTime: 0,
        }),
    })
      .then((next) => {
        if (next) setSettled({ label, state: next })
      })
      .catch((error: unknown) => {
        // Leaves the failure screen as it was, with Try Again still on it.
        console.warn('⚠️ [REGISTRATION] Retrying failed registration:', error)
      })
      .finally(() => {
        isRetrying.current = false
      })
  }, [label, uiActor])

  // Every decision that sends no `registration.resume` on load.
  const settleWithoutDispatch = useCallback(
    (decision: Exclude<SettledDecision, { kind: 'dispatch' }>) => {
      if (decision.kind === 'state') {
        if (decision.latch) decidedForLabel.current = label
        setSettled({ label, state: decision.state })
        return
      }

      // Shown, not resumed: re-entering a failed run on load would replay the
      // failure, or open a wallet prompt nobody asked for.
      const { stored, confirmedData } = decision.verdict
      uiActor.send({
        type: 'registration.failure.restore',
        confirmedData,
        run: storedRegistrationKey(stored),
      })
      decidedForLabel.current = label
      // Dropped unless the page was still on pricing, so nothing is shown.
      const isShown = uiActor.getSnapshot().context.restoredRun !== undefined
      setSettled({
        label,
        state: isShown ? { status: 'failed', retry: retryFailedRun } : IDLE,
      })
    },
    [label, uiActor, retryFailedRun],
  )

  // A live run belongs to the wallet that started it, and stops the moment
  // that wallet is gone: its record stays, as a closed tab would leave it, and
  // the decision starts over, which resumes it when the owner reconnects.
  // Otherwise the run carries on in the background with the signer it
  // captured, finishing (or failing) for a wallet the page no longer shows.
  //
  // A different wallet suspends at once. A disconnect waits out a grace period
  // first, and only counts when wagmi says so explicitly: the owner address
  // alone reads null for a moment during reconnects, HMR and tab focus, and
  // suspending on that would bounce a healthy run. Off with the kill switch,
  // since nothing could resume the run afterwards.
  useEffect(() => {
    if (!enabled || !suspendableRunOwner) return

    const suspend = () => {
      uiActor.send({ type: 'registration.suspend' })
      decidedForLabel.current = null
      setSettled({ label, state: CHECKING })
      countSuspension()
    }

    if (ownerAddress && !isResumeOwner(suspendableRunOwner, ownerAddress)) {
      suspend()
      return
    }

    if (isWalletDisconnected) {
      const timer = setTimeout(suspend, DISCONNECT_GRACE_MS)
      return () => clearTimeout(timer)
    }
  }, [
    enabled,
    suspendableRunOwner,
    ownerAddress,
    isWalletDisconnected,
    label,
    uiActor,
  ])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `suspensions` re-runs the decision after a suspend, whose other inputs may not have changed
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

    if (decision.kind !== 'dispatch') {
      settleWithoutDispatch(decision)
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
    suspensions,
    settleWithoutDispatch,
  ])

  if (settled?.label === label) return settled.state
  return hasStoredRecord ? CHECKING : IDLE
}
