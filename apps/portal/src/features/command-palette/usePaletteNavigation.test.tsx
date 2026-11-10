import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { usePaletteNavigation } from './usePaletteNavigation'

it('records scrolling without rendering and preserves it for Back and failure recovery', () => {
  const { result } = renderHook(usePaletteNavigation)
  act(() => result.current.dispatch({ type: 'open', query: 'alice' }))
  const beforeScroll = result.current
  act(() => result.current.recordScroll(120))
  expect(result.current).toBe(beforeScroll)
  expect(result.current.capture()?.current.scrollTop).toBe(120)

  act(() =>
    result.current.dispatch({
      type: 'push',
      screen: {
        type: 'entity',
        entity: { type: 'name', name: 'alice.eth' },
      },
    }),
  )
  act(() => result.current.recordScroll(37))
  expect(result.current.capture()?.current.scrollTop).toBe(37)
  act(() => result.current.dispatch({ type: 'back' }))
  expect(result.current.capture()?.current).toEqual({
    screen: { type: 'root' },
    query: 'alice',
    selectedId: '',
    scrollTop: 120,
  })
  act(() => result.current.dispatch({ type: 'query', query: 'bob' }))
  expect(result.current.capture()?.current.scrollTop).toBe(0)
})
