import { useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import commemorativeNftArtworkUrl from './assets/commemorative-nft-art.png'
import type { MigrationSuccessDialogState } from './MigrationSuccessDialog.types'

const RENDERING_DURATION_MS = 2_000

type UseCommemorativeNftPreviewOptions = {
  readonly open: boolean
  readonly migratedNameCount: number
}

const createReadyState = (
  migratedNameCount: number,
): MigrationSuccessDialogState => ({
  status: 'ready',
  artworkUrl: commemorativeNftArtworkUrl,
  migratedAt: new Date(),
  migratedNameCount,
})

/**
 * Temporary UI-only rendering state. This does not mint or verify an NFT.
 */
export const useCommemorativeNftPreview = ({
  open,
  migratedNameCount,
}: UseCommemorativeNftPreviewOptions): MigrationSuccessDialogState => {
  const shouldReduceMotion = useReducedMotion()
  const [state, setState] = useState<MigrationSuccessDialogState>(() =>
    shouldReduceMotion
      ? createReadyState(migratedNameCount)
      : { status: 'rendering' },
  )

  useEffect(() => {
    if (!open) return

    if (shouldReduceMotion) {
      setState(createReadyState(migratedNameCount))
      return
    }

    setState({ status: 'rendering' })
    const timeout = window.setTimeout(() => {
      setState(createReadyState(migratedNameCount))
    }, RENDERING_DURATION_MS)

    return () => window.clearTimeout(timeout)
  }, [migratedNameCount, open, shouldReduceMotion])

  return state
}
