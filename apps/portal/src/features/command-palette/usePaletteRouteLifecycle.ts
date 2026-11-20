import { useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import {
  cancelPaletteHandoff,
  getPaletteHandoffNavigation,
  paletteHandoff,
} from './handoff'

export const usePaletteRouteLifecycle = (onDeparture: () => void) => {
  const router = useRouter()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const previousPath = useRef(pathname)
  useEffect(() => {
    if (previousPath.current === pathname) return
    previousPath.current = pathname
    onDeparture()
    const pending = paletteHandoff.getSnapshot().pending
    if (
      pending &&
      router.buildLocation(getPaletteHandoffNavigation(pending.intent))
        .pathname !== pathname
    ) {
      cancelPaletteHandoff(pending.requestId)
    }
  }, [pathname, router, onDeparture])
}
