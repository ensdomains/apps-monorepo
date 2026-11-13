// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readRegistrationSuccessState } from '@/features/register/types/registrationSuccessState'
import { useRegistrationSuccessRedirect } from './useRegistrationSuccessRedirect'

const navigate = vi.fn()
const pollForIndexerSync = vi.fn()

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/utils/query/pollForIndexerSync', () => ({
  pollForIndexerSync: (...args: unknown[]) => pollForIndexerSync(...args),
}))
// The query-options factories pull the app's wagmi client in transitively;
// only their keys are used here, and the invalidation itself is stubbed.
vi.mock('@/features/profile/hooks/useEnsOwner', () => ({
  getEnsOwnerQueryOptions: () => ({ queryKey: ['owner'] }),
}))
vi.mock('@/features/profile/hooks/useNameAvailability', () => ({
  getNameAvailabilityQueryOptions: () => ({ queryKey: ['availability'] }),
}))
vi.mock('@/features/profile/hooks/useProfile', () => ({
  getProfileQueryOptions: () => ({ queryKey: ['profile'] }),
}))

type Params = Parameters<typeof useRegistrationSuccessRedirect>[0]

const base: Params = {
  name: 'alice.eth',
  durationSeconds: 31557600,
  isSuccess: false,
  paid: '$5.00',
}

const renderRedirect = (params: Partial<Params> = {}) =>
  renderHook((props: Params) => useRegistrationSuccessRedirect(props), {
    initialProps: { ...base, ...params },
  })

const lastNavigation = () =>
  navigate.mock.calls.at(-1)?.[0] as Record<string, unknown>

// Immunefi #92544 (WEB-1490): this hook is the only writer of the banner's
// state, so what it writes — and where — is the other half of the fix.
describe('useRegistrationSuccessRedirect', () => {
  beforeEach(() => {
    navigate.mockReset()
    pollForIndexerSync.mockReset().mockResolvedValue(undefined)
  })

  it('does nothing until the registration succeeds', async () => {
    renderRedirect({ isSuccess: false })
    await Promise.resolve()
    expect(pollForIndexerSync).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('hands the banner over in history state, never in the URL', async () => {
    renderRedirect({ isSuccess: true })

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    const navigation = lastNavigation()
    expect(navigation).toMatchObject({
      to: '/$name',
      params: { name: 'alice.eth' },
      replace: true,
      state: {
        registrationSuccess: { durationSeconds: 31557600, paid: '$5.00' },
      },
    })
    expect(navigation).not.toHaveProperty('search')
  })

  it('writes exactly what the name page reads back', async () => {
    renderRedirect({
      isSuccess: true,
      durationSeconds: 86400 * 28,
      paid: '$0.42',
    })

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(readRegistrationSuccessState(lastNavigation().state)).toEqual({
      durationSeconds: 86400 * 28,
      paid: '$0.42',
    })
  })

  it('writes no state when there is no paid figure, so no banner renders', async () => {
    renderRedirect({ isSuccess: true, paid: undefined })

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(lastNavigation().state).toBeUndefined()
    expect(readRegistrationSuccessState(lastNavigation().state)).toBeNull()
  })

  it('still redirects, with the banner, when indexer polling fails', async () => {
    pollForIndexerSync.mockRejectedValue(new Error('indexer down'))
    renderRedirect({ isSuccess: true })

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(readRegistrationSuccessState(lastNavigation().state)).not.toBeNull()
  })

  it('redirects once, even if it re-renders after success', async () => {
    const { rerender } = renderRedirect({ isSuccess: true })
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))

    rerender({ ...base, isSuccess: true, paid: '$9.99' })
    rerender({ ...base, isSuccess: true, durationSeconds: 1 })
    await Promise.resolve()

    expect(pollForIndexerSync).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledTimes(1)
  })
})
