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
    // biome-ignore lint/suspicious/noDocumentCookie: test cleanup must synchronously clear the cookie the hook sets.
    document.cookie = 'telemetry=; Path=/; Max-Age=0'
  })

  it('defaults to disabled', () => {
    const { result } = renderHook(() => useTelemetryEnabled())

    expect(result.current[0]).toBe(false)
    // The worker gates CSP reporting on this cookie (worker/csp.ts).
    expect(document.cookie).not.toContain('telemetry=1')
  })

  it('persists the preference when toggled', () => {
    const { result } = renderHook(() => useTelemetryEnabled())

    act(() => {
      result.current[1](true)
    })

    expect(result.current[0]).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
    expect(document.cookie).toContain('telemetry=1')
  })

  it('clears the cookie when toggled off', () => {
    const { result } = renderHook(() => useTelemetryEnabled())

    act(() => {
      result.current[1](true)
    })
    act(() => {
      result.current[1](false)
    })

    expect(document.cookie).not.toContain('telemetry=1')
  })

  it('loads an existing preference', () => {
    localStorage.setItem(STORAGE_KEY, 'true')

    const { result } = renderHook(() => useTelemetryEnabled())

    expect(result.current[0]).toBe(true)
  })
})
