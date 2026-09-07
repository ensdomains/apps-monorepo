import { useCallback, useState } from 'react'
import { MigrationSuccessDialog } from './MigrationSuccessDialog'
import { createUploadedNftPreviewCard } from './MigrationSuccessDialogPreview.mock'
import type { MigrationSuccessDialogState } from './success/MigrationSuccessDialog.types'

const noop = () => undefined

// Mounted only by the temporary development button; reopening replays the reveal.
export const MigrationSuccessDialogPreview = ({
  onClose,
}: {
  readonly onClose: () => void
}) => {
  const [state, setState] = useState<MigrationSuccessDialogState>(() => ({
    status: 'revealing',
    card: createUploadedNftPreviewCard(),
  }))
  const completeReveal = useCallback(() => {
    setState((current) =>
      current.status === 'revealing'
        ? { status: 'readyToMint', card: current.card }
        : current,
    )
  }, [])

  return (
    <MigrationSuccessDialog
      canMint={false}
      context="migration"
      migratedNameCount={1}
      onClose={onClose}
      onMint={noop}
      onRetry={noop}
      onRevealComplete={completeReveal}
      onViewProfile={onClose}
      open
      state={state}
    />
  )
}
