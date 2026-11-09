import { useEffect, useRef } from 'react'
import type {
  DevDrawerOpenRequest,
  DevDrawerTab,
  DevDrawerTool,
} from './drawerRequest'

export const useDevDrawerOpenRequest = ({
  tool,
  request,
  onOpen,
  onHandled,
}: {
  readonly tool?: DevDrawerTool
  readonly request: DevDrawerOpenRequest
  readonly onOpen: (tab: DevDrawerTab) => void
  readonly onHandled?: (result: 'opened' | 'unavailable') => void
}) => {
  const handledTool = useRef<DevDrawerTool | undefined>(undefined)
  const tab = request.status === 'open' ? request.tab : undefined
  useEffect(() => {
    if (!tool) {
      handledTool.current = undefined
      return
    }
    if (handledTool.current === tool) return
    handledTool.current = tool
    if (!tab) {
      onHandled?.('unavailable')
      return
    }
    onOpen(tab)
    onHandled?.('opened')
  }, [tool, tab, onOpen, onHandled])
}
