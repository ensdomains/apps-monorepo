import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useHeldWhile } from './useHeldWhile'

describe('useHeldWhile', () => {
  it('keeps the value from when holding began, and follows it again once released', () => {
    const { result, rerender } = renderHook(
      ({ isHeld, value }) => useHeldWhile(isHeld, value),
      { initialProps: { isHeld: false, value: 1 } },
    )

    rerender({ isHeld: true, value: 2 })
    rerender({ isHeld: true, value: 3 })
    expect(result.current).toBe(2)

    rerender({ isHeld: false, value: 4 })
    expect(result.current).toBe(4)
  })
})
