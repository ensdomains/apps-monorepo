// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CONSENT_STORAGE_KEY,
  readConsent,
  setStoredConsent,
} from './consent.js'
import { useAnalyticsConsent } from './react.js'

describe('useAnalyticsConsent', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts from the stored choice', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')
    const { result } = renderHook(() => useAnalyticsConsent())
    expect(result.current[0]).toBe('accepted')
  })

  it('starts null when nothing is stored', () => {
    const { result } = renderHook(() => useAnalyticsConsent())
    expect(result.current[0]).toBeNull()
  })

  it('persists the choice it sets', () => {
    const { result } = renderHook(() => useAnalyticsConsent())
    act(() => {
      result.current[1]('declined')
    })
    expect(result.current[0]).toBe('declined')
    expect(readConsent()).toBe('declined')
  })

  it('syncs every hook in the tab when one of them writes', () => {
    const first = renderHook(() => useAnalyticsConsent())
    const second = renderHook(() => useAnalyticsConsent())
    act(() => {
      first.result.current[1]('accepted')
    })
    expect(second.result.current[0]).toBe('accepted')
  })

  it('syncs when another tab writes', () => {
    const { result } = renderHook(() => useAnalyticsConsent())
    act(() => {
      localStorage.setItem(CONSENT_STORAGE_KEY, 'declined')
      window.dispatchEvent(
        new StorageEvent('storage', { key: CONSENT_STORAGE_KEY }),
      )
    })
    expect(result.current[0]).toBe('declined')
  })

  it('syncs when the choice is set outside React', () => {
    const { result } = renderHook(() => useAnalyticsConsent())
    act(() => {
      setStoredConsent('accepted')
    })
    expect(result.current[0]).toBe('accepted')
  })
})
