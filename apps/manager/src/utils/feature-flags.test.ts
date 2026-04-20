import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FEATURE_FLAGS,
  type FeatureFlag,
  getSessionProvider,
  getTransactionInfra,
  isFeatureEnabled,
  resolveInfrastructure,
} from './feature-flags'

type MutableFeatureFlags = Record<
  string,
  | boolean
  | { enabled: boolean; allowedUsers?: string[]; deniedUsers?: string[] }
>

describe('feature-flags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isFeatureEnabled', () => {
    it('should return false for non-existent feature flag', () => {
      expect(isFeatureEnabled('NON_EXISTENT' as FeatureFlag)).toBe(false)
    })

    it('should return feature enabled status without identifier', () => {
      const flag = 'DISCOUNTS_APPLIED' as keyof typeof FEATURE_FLAGS
      const result = isFeatureEnabled(flag)
      expect(typeof result).toBe('boolean')
    })

    it('should return true when feature is enabled and no user restrictions', () => {
      const flag = 'DISCOUNTS_APPLIED' as keyof typeof FEATURE_FLAGS
      const config = FEATURE_FLAGS[flag]

      if (typeof config === 'object' && config.enabled) {
        const result = isFeatureEnabled(flag, {
          walletAddress: '0x1234',
        })
        expect(result).toBe(true)
      }
    })

    it('should handle boolean config', () => {
      const originalFlags = { ...FEATURE_FLAGS }
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.TEST_FLAG = true

      expect(isFeatureEnabled('TEST_FLAG' as FeatureFlag)).toBe(true)

      // Restore
      for (const key of Object.keys(FEATURE_FLAGS)) {
        if (!(key in originalFlags)) {
          delete mutableFlags[key]
        }
      }
    })

    it('should return false when user is in denied list', () => {
      const originalFlags = { ...FEATURE_FLAGS }
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.TEST_DENIED = {
        enabled: true,
        deniedUsers: ['denied@test.com', '0xdenied'],
      }

      expect(
        isFeatureEnabled('TEST_DENIED' as FeatureFlag, {
          email: 'denied@test.com',
        }),
      ).toBe(false)

      expect(
        isFeatureEnabled('TEST_DENIED' as FeatureFlag, {
          walletAddress: '0xDENIED',
        }),
      ).toBe(false)

      // Restore
      for (const key of Object.keys(FEATURE_FLAGS)) {
        if (!(key in originalFlags)) {
          delete mutableFlags[key]
        }
      }
    })

    it('should return true when user is in allowed list', () => {
      const originalFlags = { ...FEATURE_FLAGS }
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.TEST_ALLOWED = {
        enabled: false,
        allowedUsers: ['allowed@test.com', '0xallowed'],
      }

      expect(
        isFeatureEnabled('TEST_ALLOWED' as FeatureFlag, {
          email: 'allowed@test.com',
        }),
      ).toBe(true)

      expect(
        isFeatureEnabled('TEST_ALLOWED' as FeatureFlag, {
          walletAddress: '0xALLOWED',
        }),
      ).toBe(true)

      // Restore
      for (const key of Object.keys(FEATURE_FLAGS)) {
        if (!(key in originalFlags)) {
          delete mutableFlags[key]
        }
      }
    })

    it('should handle case-insensitive matching', () => {
      const originalFlags = { ...FEATURE_FLAGS }
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.TEST_CASE = {
        enabled: false,
        allowedUsers: ['test@example.com'],
      }

      expect(
        isFeatureEnabled('TEST_CASE' as FeatureFlag, {
          email: 'TEST@EXAMPLE.COM',
        }),
      ).toBe(true)

      expect(
        isFeatureEnabled('TEST_CASE' as FeatureFlag, {
          email: ' Test@Example.Com ',
        }),
      ).toBe(true)

      // Restore
      for (const key of Object.keys(FEATURE_FLAGS)) {
        if (!(key in originalFlags)) {
          delete mutableFlags[key]
        }
      }
    })

    it('should match against wallet address', () => {
      const originalFlags = { ...FEATURE_FLAGS }
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.TEST_WALLET = {
        enabled: false,
        allowedUsers: ['0x1234567890abcdef'],
      }

      expect(
        isFeatureEnabled('TEST_WALLET' as FeatureFlag, {
          walletAddress: '0x1234567890ABCDEF',
        }),
      ).toBe(true)

      // Restore
      for (const key of Object.keys(FEATURE_FLAGS)) {
        if (!(key in originalFlags)) {
          delete mutableFlags[key]
        }
      }
    })

    it('should match against email', () => {
      const originalFlags = { ...FEATURE_FLAGS }
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.TEST_EMAIL = {
        enabled: false,
        allowedUsers: ['test@example.com'],
      }

      expect(
        isFeatureEnabled('TEST_EMAIL' as FeatureFlag, {
          email: 'test@example.com',
        }),
      ).toBe(true)

      // Restore
      for (const key of Object.keys(FEATURE_FLAGS)) {
        if (!(key in originalFlags)) {
          delete mutableFlags[key]
        }
      }
    })

    it('should match against phone', () => {
      const originalFlags = { ...FEATURE_FLAGS }
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.TEST_PHONE = {
        enabled: false,
        allowedUsers: ['(425)-555-1234'],
      }

      expect(
        isFeatureEnabled('TEST_PHONE' as FeatureFlag, {
          phone: '(425)-555-1234',
        }),
      ).toBe(true)

      // Restore
      for (const key of Object.keys(FEATURE_FLAGS)) {
        if (!(key in originalFlags)) {
          delete mutableFlags[key]
        }
      }
    })

    it('should prioritize denied list over allowed list', () => {
      const originalFlags = { ...FEATURE_FLAGS }
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.TEST_PRIORITY = {
        enabled: true,
        allowedUsers: ['test@example.com'],
        deniedUsers: ['test@example.com'],
      }

      expect(
        isFeatureEnabled('TEST_PRIORITY' as FeatureFlag, {
          email: 'test@example.com',
        }),
      ).toBe(false)

      // Restore
      for (const key of Object.keys(FEATURE_FLAGS)) {
        if (!(key in originalFlags)) {
          delete mutableFlags[key]
        }
      }
    })

    it('should return base enabled when no user lists match', () => {
      const originalFlags = { ...FEATURE_FLAGS }
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.TEST_BASE = {
        enabled: true,
        allowedUsers: ['other@example.com'],
      }

      expect(
        isFeatureEnabled('TEST_BASE' as FeatureFlag, {
          email: 'test@example.com',
        }),
      ).toBe(true)

      // Restore
      for (const key of Object.keys(FEATURE_FLAGS)) {
        if (!(key in originalFlags)) {
          delete mutableFlags[key]
        }
      }
    })
  })

  describe('provider and infra helpers', () => {
    it('getSessionProvider returns zerodev when flag is disabled', () => {
      const original = FEATURE_FLAGS.RHINESTONE_SESSIONS
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.RHINESTONE_SESSIONS = { enabled: false }

      expect(getSessionProvider()).toBe('zerodev')

      mutableFlags.RHINESTONE_SESSIONS =
        original as unknown as MutableFeatureFlags[string]
    })

    it('getSessionProvider returns rhinestone when flag is enabled', () => {
      const original = FEATURE_FLAGS.RHINESTONE_SESSIONS
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.RHINESTONE_SESSIONS = { enabled: true }

      expect(getSessionProvider()).toBe('rhinestone')

      mutableFlags.RHINESTONE_SESSIONS =
        original as unknown as MutableFeatureFlags[string]
    })

    it('getTransactionInfra returns pimlico when flag is disabled', () => {
      const original = FEATURE_FLAGS.USE_WARP_INFRA
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.USE_WARP_INFRA = { enabled: false }

      expect(getTransactionInfra()).toBe('pimlico')

      mutableFlags.USE_WARP_INFRA =
        original as unknown as MutableFeatureFlags[string]
    })

    it('getTransactionInfra returns warp when flag is enabled', () => {
      const original = FEATURE_FLAGS.USE_WARP_INFRA
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.USE_WARP_INFRA = { enabled: true }

      expect(getTransactionInfra()).toBe('warp')

      mutableFlags.USE_WARP_INFRA =
        original as unknown as MutableFeatureFlags[string]
    })

    it('resolveInfrastructure prioritizes explicit override', () => {
      expect(resolveInfrastructure({ infrastructure: 'warp' }, 'pimlico')).toBe(
        'warp',
      )
    })

    it('resolveInfrastructure prioritizes signer default over flag', () => {
      expect(resolveInfrastructure(undefined, 'warp')).toBe('warp')
    })

    it('resolveInfrastructure falls back to feature flag default', () => {
      const original = FEATURE_FLAGS.USE_WARP_INFRA
      const mutableFlags = FEATURE_FLAGS as unknown as MutableFeatureFlags
      mutableFlags.USE_WARP_INFRA = { enabled: false }

      expect(resolveInfrastructure()).toBe('pimlico')

      mutableFlags.USE_WARP_INFRA =
        original as unknown as MutableFeatureFlags[string]
    })
  })
})
