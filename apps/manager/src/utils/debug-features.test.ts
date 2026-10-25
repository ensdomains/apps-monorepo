import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('debug profile selection', () => {
  it('selects each fixture when debug features are enabled', async () => {
    vi.resetModules()
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_ENABLE_DEBUG_FEATURES', 'true')
    const { getDebugProfileRecords, DEBUG_PROFILE, DEBUG_ADDRESSES_PROFILE } =
      await import('../features/profile/MOCK')
    expect(getDebugProfileRecords('debug.example')).toBe(DEBUG_PROFILE)
    expect(getDebugProfileRecords('debug-addresses.example')).toBe(
      DEBUG_ADDRESSES_PROFILE,
    )
    expect(getDebugProfileRecords('onshow.eth')).toBeUndefined()
  })

  it('does not serve either fixture in production without the debug flag', async () => {
    vi.resetModules()
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_ENABLE_DEBUG_FEATURES', 'false')
    const { getDebugProfileRecords } = await import('../features/profile/MOCK')
    expect(getDebugProfileRecords('debug.example')).toBeUndefined()
    expect(getDebugProfileRecords('debug-addresses.example')).toBeUndefined()
  })
})
