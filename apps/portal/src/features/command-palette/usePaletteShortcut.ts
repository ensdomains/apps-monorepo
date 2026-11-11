import { useEffect } from 'react'
import { hasBlockingPaletteDialog } from './dialogBoundary'

const isPaletteShortcut = (event: KeyboardEvent): boolean =>
  !event.isComposing &&
  !event.altKey &&
  (event.metaKey || event.ctrlKey) &&
  (event.key.toLowerCase() === 'k' || event.code === 'KeyK')

export const usePaletteShortcut = ({
  isOpen,
  isBlocked = false,
  open,
  close,
}: {
  readonly isOpen: boolean
  readonly isBlocked?: boolean
  readonly open: () => void
  readonly close: () => void
}) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event)) return
      if (!isOpen && isBlocked) return
      if (!isOpen && hasBlockingPaletteDialog()) return
      event.preventDefault()
      if (isOpen) close()
      else open()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, isBlocked, open, close])
}
