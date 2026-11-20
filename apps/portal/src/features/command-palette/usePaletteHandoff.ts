import { useEffect, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import {
  getPaletteHandoffDecision,
  type PaletteHandoffIntent,
  type PaletteHandoffReadiness,
  paletteHandoff,
} from './handoff'

export const usePaletteHandoff = ({
  onOpen,
  ...consumer
}: PaletteHandoffIntent & {
  readonly readiness: PaletteHandoffReadiness
  readonly onOpen: () => void
}) => {
  const snapshot = useSyncExternalStore(
    paletteHandoff.subscribe,
    paletteHandoff.getSnapshot,
    paletteHandoff.getSnapshot,
  )
  const decision = getPaletteHandoffDecision(snapshot.pending, consumer)

  useEffect(() => {
    if (
      decision.status === 'ready' &&
      paletteHandoff.claim(decision.requestId)
    ) {
      onOpen()
    }
    if (
      decision.status === 'blocked' &&
      paletteHandoff.reject(decision.requestId, decision.reason)
    ) {
      toast.error(decision.reason)
    }
  }, [decision, onOpen])
}
