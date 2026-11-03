import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('app links per network', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it.each([
    {
      isSepoliaBuild: false,
      upgrade: 'https://app.ens.domains/upgrade',
      legacy: 'https://legacy.app.ens.domains',
    },
    {
      isSepoliaBuild: true,
      upgrade: 'https://sepolia.app.ens.domains/upgrade',
      legacy: 'https://legacy.sepolia.app.ens.domains',
    },
  ])(
    'isSepoliaBuild=$isSepoliaBuild links to the manager and ens-app-v3',
    async ({ isSepoliaBuild, upgrade, legacy }) => {
      vi.doMock('@/config', () => ({ isSepoliaBuild }))
      const { MANAGER_UPGRADE_URL, LEGACY_APP_BASE_URL } = await import(
        './domain'
      )
      expect(MANAGER_UPGRADE_URL).toBe(upgrade)
      expect(LEGACY_APP_BASE_URL).toBe(legacy)
    },
  )
})
