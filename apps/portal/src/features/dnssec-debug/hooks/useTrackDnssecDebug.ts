import { useEffect } from 'react'
import { type PostHogEvents, track } from '@/lib/posthog/events'
import type { DnssecVerdict } from '../utils/verdict'

export type DnssecDebugSource = PostHogEvents['dnssec_debug:opened']['source']

export const useTrackDnssecDebugOpened = ({
  name,
  source,
}: {
  readonly name: string
  readonly source: DnssecDebugSource
}) => {
  useEffect(() => {
    track('dnssec_debug:opened', { name, source })
  }, [name, source])
}

const getFailedStep = (verdict: DnssecVerdict): string | null => {
  switch (verdict.kind) {
    case 'broken':
    case 'path-broken':
    case 'oracle-rejected':
    case 'oracle-unavailable':
      return verdict.step
    case 'not-enabled':
      return verdict.zone
    default:
      return null
  }
}

/** Fires once per settled verdict — pass `null` while checks are running. */
export const useTrackDnssecDebugResult = ({
  name,
  verdict,
}: {
  readonly name: string
  readonly verdict: DnssecVerdict | null
}) => {
  const kind = verdict?.kind ?? null
  const failedStep = verdict ? getFailedStep(verdict) : null
  useEffect(() => {
    if (kind === null) return
    track('dnssec_debug:result', {
      name,
      verdict: kind,
      failed_step: failedStep,
    })
  }, [name, kind, failedStep])
}
