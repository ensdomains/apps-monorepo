import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLatchedFlag } from './useLatchedFlag'

const renderLatch = (isOn: boolean, resetKey = 'example.eth:0xabc') =>
  renderHook(
    (props: { readonly isOn: boolean; readonly resetKey: string }) =>
      useLatchedFlag(props.isOn, props.resetKey),
    { initialProps: { isOn, resetKey } },
  )

describe('useLatchedFlag', () => {
  it('stays on after the input drops back to false', () => {
    const { result, rerender } = renderLatch(true)

    rerender({ isOn: false, resetKey: 'example.eth:0xabc' })

    expect(result.current).toBe(true)
  })

  it('turns on later, once the input does', () => {
    const { result, rerender } = renderLatch(false)

    expect(result.current).toBe(false)
    rerender({ isOn: true, resetKey: 'example.eth:0xabc' })

    expect(result.current).toBe(true)
  })

  it('starts over when the reset key changes', () => {
    const { result, rerender } = renderLatch(true)

    rerender({ isOn: false, resetKey: 'example.eth:0xdef' })

    expect(result.current).toBe(false)
  })
})
