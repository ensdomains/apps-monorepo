// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTelemetryEnabled } from './useTelemetryEnabled'

const STORAGE_KEY = 'telemetry-enabled'

describe('useTelemetryEnabled', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to disabled', () => {
    const { result } = renderHook(() => useTelemetryEnabled())

    expect(result.current[0]).toBe(false)
  })

  it('persists the preference when toggled', () => {
    const { result } = renderHook(() => useTelemetryEnabled())

    act(() => {
      result.current[1](true)
    })

    expect(result.current[0]).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
  })

  it('loads an existing preference', () => {
    localStorage.setItem(STORAGE_KEY, 'true')

    const { result } = renderHook(() => useTelemetryEnabled())

    expect(result.current[0]).toBe(true)
  })
})
