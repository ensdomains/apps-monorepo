import { useEffect, useRef, useState } from 'react'

export const useTraitsPopover = () => {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const cancelClose = () => clearTimeout(closeTimer.current)

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  return {
    open,
    onOpenChange: (value: boolean) => {
      cancelClose()
      setOpen(value)
    },
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      cancelClose()
      setOpen(true)
    },
    onPointerLeave: (event: React.PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      cancelClose()
      // Allow the pointer to cross the gap into the traits panel.
      closeTimer.current = setTimeout(() => setOpen(false), 150)
    },
  }
}
