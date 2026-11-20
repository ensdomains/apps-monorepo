import {
  DevDrawer,
  type DevDrawerTool,
  isDevDrawerEnabled,
} from '@ens-apps/dev-tools'
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

export const PaletteDeveloperTools = ({
  tool,
  onClose,
}: {
  readonly tool?: DevDrawerTool
  readonly onClose: () => void
}) => {
  const isEnabled = isDevDrawerEnabled()
  const rejectedTool = useRef<DevDrawerTool | undefined>(undefined)
  const onHandled = useCallback(
    (result: 'opened' | 'unavailable') => {
      if (result === 'unavailable')
        toast.error('This developer tool is not enabled.')
      onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!tool) {
      rejectedTool.current = undefined
      return
    }
    if (isEnabled || rejectedTool.current === tool) return
    rejectedTool.current = tool
    onHandled('unavailable')
  }, [tool, isEnabled, onHandled])

  return <DevDrawer openTool={tool} onOpenRequestHandled={onHandled} />
}
