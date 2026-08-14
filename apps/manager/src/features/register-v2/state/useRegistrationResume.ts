/**
 * Resume an interrupted registration on mount.
 *
 * Runs the preflight, gates on identity and session, and dispatches
 * `registration.resume` exactly once per label. Auto-resumes rather than
 * asking: the user navigated back to `/register/$name` deliberately, and a
 * confirmation prompt in front of a flow they already paid to start is friction
 * without a decision behind it.
 */

import { useEffect, useRef, useState } from 'react'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { needsSessionBeforeRegistration } from '@/lib/smart-account/sessionGate'
import { publicClient } from '@/lib/wagmi'
import {
  assessResumableRegistration,
  isResumeOwner,
  type ResumeStaleReason,
} from '../service/assessResumableRegistration'
import { clearStoredRegistration } from '../service/registrationPersistence'
import type { RegistrationV2UiActor } from './registrationUi.machine'

export type RegistrationResumeState =
  /** Still deciding — the wallet may not have finished restoring. */
  | { readonly status: 'checking' }
  /** Nothing to do; render the normal pricing flow. */
  | { readonly status: 'idle' }
  /** A record exists but belongs to another wallet. */
  | { readonly status: 'wrong-wallet'; readonly expectedOwner: string }
  /** A record existed and was discarded; tell the user why. */
  | { readonly status: 'discarded'; readonly reason: ResumeStaleReason }
  /** `registration.resume` has been dispatched. */
  | { readonly status: 'resumed' }

/**
 * What the effect should do next.
 *
 * `latch` says whether the decision is final for this label. A wrong wallet is
 * deliberately NOT final — the user can connect the right one and the resume
 * should pick up when they do — and neither is a rejected session enable.
 */
type ResumeDecision = {
  readonly state: RegistrationResumeState
  readonly latch: boolean
  readonly dispatch?: Parameters<RegistrationV2UiActor['send']>[0]
}

async function decideResume(params: {
  label: string
  account: ReturnType<typeof useSmartAccountContext>
}): Promise<ResumeDecision> {
  const { label, account } = params

  const assessment = await assessResumableRegistration({
    label,
    chainId: publicClient.chain.id,
    publicClient,
  })

  if (assessment.status === 'none') {
    return { state: { status: 'idle' }, latch: true }
  }

  if (assessment.status === 'stale') {
    clearStoredRegistration()
    return {
      state: { status: 'discarded', reason: assessment.reason },
      latch: true,
    }
  }

  const recordOwner = assessment.stored.record.context.ownerAddress

  if (!isResumeOwner(recordOwner, account.ownerAddress)) {
    return {
      state: { status: 'wrong-wallet', expectedOwner: recordOwner ?? '' },
      latch: false,
    }
  }

  // A session that expired while the tab was closed has to be re-enabled before
  // the reveal can be signed. `needsSessionBeforeRegistration` also rejects one
  // with too little headroom left to outlive the commitment cooldown — the case
  // that would otherwise strand a paid commitment with an unsignable reveal.
  if (needsSessionBeforeRegistration(account)) {
    const signer = await account.enableSession()
    if (!signer) {
      // Rejected or failed. Leave the record in place and stay un-latched so a
      // reconnect can still resume.
      return { state: { status: 'idle' }, latch: false }
    }
  }

  // Prompt-free in the common case: rebuilt from the stored authorization
  // signature, with no wallet interaction.
  const hcaSessionEnable = await account.getSessionEnablePayload()

  return {
    state: { status: 'resumed' },
    latch: true,
    dispatch: {
      type: 'registration.resume',
      label,
      confirmedData: assessment.confirmedData,
      record: assessment.stored.record,
      postRegistrationSetup: assessment.stored.postRegistrationSetup,
      account,
      hcaSessionEnable,
    },
  }
}

export function useRegistrationResume(params: {
  label: string
  uiActor: RegistrationV2UiActor
  /** Set false to disable resume entirely (rollout switch). */
  enabled?: boolean
}): RegistrationResumeState {
  const { label, uiActor, enabled = true } = params
  const account = useSmartAccountContext()
  const [state, setState] = useState<RegistrationResumeState>({
    status: 'checking',
  })

  // One decision per label. Without this latch the effect re-runs on every
  // account re-render and could dispatch a second resume into a flow that is
  // already running.
  const decidedForLabel = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' })
      return
    }

    if (decidedForLabel.current === label) return

    // The wallet restores asynchronously. Deciding "wrong wallet" before it has
    // settled would show the banner to the very user who owns the record.
    if (!account.hasInitialized) return

    let cancelled = false

    void decideResume({ label, account }).then((decision) => {
      if (cancelled) return

      if (decision.latch) decidedForLabel.current = label
      if (decision.dispatch) uiActor.send(decision.dispatch)
      setState(decision.state)
    })

    return () => {
      cancelled = true
    }
  }, [enabled, label, account, uiActor])

  return state
}
