import { useEffect, useRef } from 'react'

export const useRequestedProfileDialogOpen = ({
  requestedOpen,
  open,
  handleOpenChange,
  onOpenChange,
}: {
  readonly requestedOpen: boolean | undefined
  readonly open: boolean
  readonly handleOpenChange: (open: boolean) => void
  readonly onOpenChange: ((open: boolean) => void) | undefined
}) => {
  const wasRequestedOpen = useRef(false)
  const wasOpen = useRef(false)

  useEffect(() => {
    const shouldOpen = requestedOpen === true && !wasRequestedOpen.current
    const didClose = wasOpen.current && !open
    wasRequestedOpen.current = requestedOpen === true
    wasOpen.current = open

    // Opening is a request, not a permanent override: save completion closes
    // the actor internally and must notify the launcher instead of reopening.
    if (shouldOpen && !open) handleOpenChange(true)
    else if (requestedOpen === false && open) handleOpenChange(false)
    else if (requestedOpen === true && didClose) onOpenChange?.(false)
  }, [requestedOpen, open, handleOpenChange, onOpenChange])
}
