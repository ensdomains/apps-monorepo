import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './route'

const getFeatureFlagMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
}))

vi.mock('@/lib/posthog/get-feature-flag', () => ({
  getFeatureFlag: getFeatureFlagMock,
}))

const runBeforeLoad = async () => {
  const beforeLoad = Route.options.beforeLoad

  if (!beforeLoad) throw new Error('Expected a profile feature flag check')

  return beforeLoad({} as never)
}

describe('/$name profile feature flag context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes an explicitly enabled server feature flag', async () => {
    getFeatureFlagMock.mockResolvedValue(true)

    await expect(runBeforeLoad()).resolves.toEqual({
      profileViewNewEnabled: true,
    })
    expect(getFeatureFlagMock).toHaveBeenCalledWith({
      data: { flag: 'profile-view-new' },
    })
  })

  it.each([
    false,
    null,
  ])('fails closed when the server feature flag returns %s', async (result) => {
    getFeatureFlagMock.mockResolvedValue(result)

    await expect(runBeforeLoad()).resolves.toEqual({
      profileViewNewEnabled: false,
    })
  })
})
