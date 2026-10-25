import { getCookie } from '@tanstack/react-start/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getConnectionCookie } from '@/lib/connection-cookie'
import { getFeatureFlag } from './get-feature-flag'

const { isFeatureEnabledMock, posthogConstructorMock, shutdownMock } =
  vi.hoisted(() => ({
    isFeatureEnabledMock: vi.fn(),
    posthogConstructorMock: vi.fn(),
    shutdownMock: vi.fn(),
  }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (validator: (input: unknown) => unknown) => ({
      handler:
        (handler: (options: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          handler({ data: validator(data) }),
    }),
  }),
}))

vi.mock('posthog-node', () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      posthogConstructorMock(...args)
    }

    isFeatureEnabled = isFeatureEnabledMock
    shutdown = shutdownMock
  },
}))

vi.mock('@/lib/connection-cookie', () => ({
  getConnectionCookie: vi.fn(),
}))

// Reads the analytics consent cookie.
vi.mock('@tanstack/react-start/server', () => ({ getCookie: vi.fn() }))

const WALLET_ADDRESS = '0x1111111111111111111111111111111111111111'
// The check runs under a throwaway UUID, never the wallet.
const ANONYMOUS_ID = expect.stringMatching(
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/,
)
const MIGRATION_FLAG_INPUT = { data: { flag: 'migration' as const } }
const MIGRATION_NFT_FLAG_INPUT = {
  data: { flag: 'migration-nft' as const },
}

describe('getFeatureFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'test-key')
    vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', 'https://posthog.example')
    vi.mocked(getConnectionCookie).mockReturnValue(WALLET_ADDRESS)
    vi.mocked(getCookie).mockReturnValue('1')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the server-side migration flag value for the connected wallet', async () => {
    isFeatureEnabledMock.mockResolvedValue(true)

    await expect(getFeatureFlag(MIGRATION_FLAG_INPUT)).resolves.toBe(true)
    expect(posthogConstructorMock).toHaveBeenCalledWith('test-key', {
      flushAt: 1,
      flushInterval: 0,
      host: 'https://posthog.example',
      requestTimeout: 1000,
    })
    expect(isFeatureEnabledMock).toHaveBeenCalledWith(
      'migration',
      ANONYMOUS_ID,
      {
        personProperties: { address: WALLET_ADDRESS },
        sendFeatureFlagEvents: false,
      },
    )
    expect(shutdownMock).toHaveBeenCalledWith(100)
  })

  it.each([
    ['no answer', undefined],
    ['a Decline', '0'],
  ])('leaves the wallet address out after %s', async (_answer, cookie) => {
    vi.mocked(getCookie).mockReturnValue(cookie)
    isFeatureEnabledMock.mockResolvedValue(false)

    await expect(getFeatureFlag(MIGRATION_FLAG_INPUT)).resolves.toBe(false)
    expect(isFeatureEnabledMock).toHaveBeenCalledWith(
      'migration',
      ANONYMOUS_ID,
      { sendFeatureFlagEvents: false },
    )
  })

  it('returns false when the server-side migration flag is disabled', async () => {
    isFeatureEnabledMock.mockResolvedValue(false)

    await expect(getFeatureFlag(MIGRATION_FLAG_INPUT)).resolves.toBe(false)
  })

  it('evaluates the commemorative NFT feature flag', async () => {
    isFeatureEnabledMock.mockResolvedValue(true)

    await expect(getFeatureFlag(MIGRATION_NFT_FLAG_INPUT)).resolves.toBe(true)
    expect(isFeatureEnabledMock).toHaveBeenCalledWith(
      'migration-nft',
      ANONYMOUS_ID,
      {
        personProperties: { address: WALLET_ADDRESS },
        sendFeatureFlagEvents: false,
      },
    )
  })

  it('treats an omitted boolean flag as disabled', async () => {
    isFeatureEnabledMock.mockResolvedValue(undefined)

    await expect(getFeatureFlag(MIGRATION_FLAG_INPUT)).resolves.toBe(false)
  })

  it('does not create a PostHog client without a connected wallet', async () => {
    vi.mocked(getConnectionCookie).mockReturnValue(null)

    await expect(getFeatureFlag(MIGRATION_FLAG_INPUT)).resolves.toBeNull()
    expect(posthogConstructorMock).not.toHaveBeenCalled()
  })

  it('fails open when PostHog is not configured', async () => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', '')

    await expect(getFeatureFlag(MIGRATION_FLAG_INPUT)).resolves.toBeNull()
    expect(posthogConstructorMock).not.toHaveBeenCalled()
  })

  it('fails open when PostHog throws', async () => {
    const error = new Error('PostHog unavailable')
    const warnMock = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    isFeatureEnabledMock.mockRejectedValue(error)

    await expect(getFeatureFlag(MIGRATION_FLAG_INPUT)).resolves.toBeNull()
    expect(warnMock).toHaveBeenCalledWith(
      '[posthog] Feature flag evaluation failed',
      {
        error,
        flag: 'migration',
      },
    )
    expect(shutdownMock).toHaveBeenCalledWith(100)

    warnMock.mockRestore()
  })

  it('rejects unknown feature flags', () => {
    expect(() =>
      getFeatureFlag({ data: { flag: 'unknown' as 'migration' } }),
    ).toThrow('Invalid PostHog feature flag')
    expect(posthogConstructorMock).not.toHaveBeenCalled()
  })
})
