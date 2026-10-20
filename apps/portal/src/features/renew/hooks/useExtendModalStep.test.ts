// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useExtendModalStep } from './useExtendModalStep'

type Step = 'disclaimer' | 'settings' | 'summary'

describe('useExtendModalStep', () => {
  it('starts on the disclaimer for a name the wallet does not own', () => {
    const { result } = renderHook(() =>
      useExtendModalStep<Step>({ open: true, isOwner: false }),
    )

    expect(result.current[0]).toBe('disclaimer')
  })

  it('skips the disclaimer once the wallet is known to own every name', () => {
    const { result, rerender } = renderHook(
      ({ isOwner }) => useExtendModalStep<Step>({ open: true, isOwner }),
      { initialProps: { isOwner: false } },
    )

    rerender({ isOwner: true })

    expect(result.current[0]).toBe('settings')
  })

  it('leaves a later step alone when ownership resolves', () => {
    const { result, rerender } = renderHook(
      ({ isOwner }) => useExtendModalStep<Step>({ open: true, isOwner }),
      { initialProps: { isOwner: false } },
    )

    act(() => result.current[1]('summary'))
    rerender({ isOwner: true })

    expect(result.current[0]).toBe('summary')
  })

  it('resets on close to the first step the wallet will see', () => {
    const { result, rerender } = renderHook(
      ({ open, isOwner }) => useExtendModalStep<Step>({ open, isOwner }),
      { initialProps: { open: true, isOwner: true } },
    )

    act(() => result.current[1]('summary'))
    rerender({ open: false, isOwner: true })
    expect(result.current[0]).toBe('settings')

    rerender({ open: false, isOwner: false })
    expect(result.current[0]).toBe('disclaimer')
  })
})
