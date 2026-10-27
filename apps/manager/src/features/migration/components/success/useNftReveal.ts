import { useEffect, useRef, useState } from 'react'
import {
  NFT_REVEAL_FADE_IN_MS,
  NFT_REVEAL_FADE_OUT_MS,
} from './reveal/revealTiming'

type RevealPhase = 'waiting' | 'hiding-cover' | 'showing-artwork' | 'complete'

/** Fade out the flat cover before showing the independently moving 3D card. */
export const useNftReveal = (params: {
  readonly enabled: boolean
  readonly status: 'loading' | 'ready' | 'error'
  readonly visible: boolean
}) => {
  const started = useRef(false)
  const [phase, setPhase] = useState<RevealPhase>('waiting')
  const complete = phase === 'complete'
  const ready = params.status === 'ready'

  useEffect(() => {
    if (!params.enabled || !params.visible) {
      // Returning to an already-revealed card must not replay the ceremony.
      if (started.current) setPhase('complete')
      return
    }
    if (!ready || complete) return

    started.current = true
    setPhase('hiding-cover')
    const revealTimer = window.setTimeout(
      () => setPhase('showing-artwork'),
      NFT_REVEAL_FADE_OUT_MS,
    )
    const completeTimer = window.setTimeout(
      () => setPhase('complete'),
      NFT_REVEAL_FADE_OUT_MS + NFT_REVEAL_FADE_IN_MS,
    )

    return () => {
      window.clearTimeout(revealTimer)
      window.clearTimeout(completeTimer)
    }
  }, [complete, params.enabled, ready, params.visible])

  const revealed = !params.enabled || complete
  return {
    ready: ready && revealed,
    showPlaceholder: !ready || (params.enabled && phase === 'waiting'),
    showArtwork: ready && (phase === 'showing-artwork' || revealed),
    status: ready && !revealed ? ('loading' as const) : params.status,
  }
}
