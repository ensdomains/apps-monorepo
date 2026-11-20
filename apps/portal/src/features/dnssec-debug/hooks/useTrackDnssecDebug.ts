import { useEffect } from 'react'
import { type AnalyticsEvents, track } from '@/lib/posthog/events'
import type { DnssecVerdict } from '../utils/verdict'

export type DnssecDebugSource = AnalyticsEvents['dnssec_debug:opened']['source']

export const useTrackDnssecDebugOpened = ({
  name,
  source,
}: {
  readonly name: string
  readonly source: DnssecDebugSource
}) => {
  useEffect(() => {
    if (!name) return
    track('dnssec_debug:opened', { source })
  }, [name, source])
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
  useEffect(() => {
    if (!name || kind === null) return
    track('dnssec_debug:result', {
      verdict: kind,
    })
  }, [name, kind])
}
