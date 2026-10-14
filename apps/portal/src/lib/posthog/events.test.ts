// @vitest-environment happy-dom

import { CONSENT_STORAGE_KEY } from '@ens-apps/analytics-consent/consent'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { track, trackWithOptions } from './events'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
}))

vi.mock('posthog-js/dist/module.full.no-external', () => ({
  default: { capture: mocks.capture },
}))

describe('posthog track consent gate', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.capture.mockClear()
  })

  it('captures when the visitor accepted analytics', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')
    track('dnssec_debug:opened', { name: 'nick.eth', source: 'direct' })
    expect(mocks.capture).toHaveBeenCalledWith('dnssec_debug:opened', {
      name: 'nick.eth',
      source: 'direct',
    })
  })

  it('drops events when the visitor declined', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'declined')
    track('dnssec_debug:opened', { name: 'nick.eth', source: 'direct' })
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('drops events when no choice was made', () => {
    track('wallet:disconnect')
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('gates trackWithOptions the same way', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'declined')
    trackWithOptions(
      'dnssec_debug:opened',
      { name: 'nick.eth', source: 'direct' },
      { timestamp: new Date(0) },
    )
    expect(mocks.capture).not.toHaveBeenCalled()

    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')
    trackWithOptions(
      'dnssec_debug:opened',
      { name: 'nick.eth', source: 'direct' },
      { timestamp: new Date(0) },
    )
    expect(mocks.capture).toHaveBeenCalledTimes(1)
  })
})
