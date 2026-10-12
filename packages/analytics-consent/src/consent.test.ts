// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_STORAGE_KEY,
  readConsent,
  setStoredConsent,
  writeConsent,
} from './consent.js'

describe('analytics consent storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads null when no choice was made', () => {
    expect(readConsent()).toBeNull()
  })

  it('reads null for an unrecognized stored value', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'maybe')
    expect(readConsent()).toBeNull()
  })

  it('round-trips an accepted choice', () => {
    writeConsent('accepted')
    expect(readConsent()).toBe('accepted')
  })

  it('round-trips a declined choice', () => {
    writeConsent('declined')
    expect(readConsent()).toBe('declined')
  })

  it('notifies this tab synchronously when the choice is set', () => {
    const listener = vi.fn()
    window.addEventListener(CONSENT_CHANGE_EVENT, listener)
    setStoredConsent('accepted')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(readConsent()).toBe('accepted')
    window.removeEventListener(CONSENT_CHANGE_EVENT, listener)
  })
})
