import { useCallback, useReducer, useRef } from 'react'
import {
  INITIAL_PALETTE_STATE,
  type PaletteEvent,
  paletteReducer,
} from './core/state'

export const usePaletteNavigation = () => {
  const [state, reduce] = useReducer(paletteReducer, INITIAL_PALETTE_STATE)
  const scrollPosition = useRef<number | null>(null)
  const recordScroll = useCallback((scrollTop: number) => {
    scrollPosition.current = scrollTop
  }, [])
  const dispatch = useCallback((event: PaletteEvent) => {
    if (scrollPosition.current !== null)
      reduce({ type: 'scroll', scrollTop: scrollPosition.current })
    reduce(event)
    scrollPosition.current = null
  }, [])
  const capture = () =>
    state.status === 'open'
      ? {
          ...state,
          current: {
            ...state.current,
            scrollTop: scrollPosition.current ?? state.current.scrollTop,
          },
        }
      : null
  return { state, dispatch, recordScroll, capture }
}
