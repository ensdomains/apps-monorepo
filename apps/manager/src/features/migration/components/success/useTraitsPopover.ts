import { useEffect, useRef, useState } from 'react'

export const useTraitsPopover = () => {
  const [isOpen, setIsOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const cancelClose = () => clearTimeout(closeTimer.current)

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  return {
    isOpen,
    onOpenChange: (shouldOpen: boolean) => {
      cancelClose()
      setIsOpen(shouldOpen)
    },
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      cancelClose()
      setIsOpen(true)
    },
    onPointerLeave: (event: React.PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      cancelClose()
      // Allow the pointer to cross the gap into the traits panel.
      closeTimer.current = setTimeout(() => setIsOpen(false), 150)
    },
  }
}
