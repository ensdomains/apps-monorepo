import { isNotFound } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const debugFeaturesMock = vi.hoisted(() => ({
  DEBUG_FEATURES_ENABLED: true,
}))

vi.mock('@/utils/debug-features', () => debugFeaturesMock)

import { debugRouteBeforeLoad } from './-guard'

describe('debugRouteBeforeLoad', () => {
  beforeEach(() => {
    debugFeaturesMock.DEBUG_FEATURES_ENABLED = true
  })

  it('allows navigation when debug features are enabled', () => {
    expect(() => debugRouteBeforeLoad()).not.toThrow()
  })

  it('throws notFound when debug features are disabled', () => {
    debugFeaturesMock.DEBUG_FEATURES_ENABLED = false

    try {
      debugRouteBeforeLoad()
      throw new Error('Expected notFound')
    } catch (error) {
      expect(isNotFound(error)).toBe(true)
    }
  })
})
