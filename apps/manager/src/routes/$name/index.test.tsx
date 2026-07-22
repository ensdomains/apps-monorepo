import { render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './index'

const useFeatureFlagEnabledMock = vi.hoisted(() => vi.fn())
const routeContextFlagMock = vi.hoisted(() => vi.fn())

vi.mock('@posthog/react', () => ({
  useFeatureFlagEnabled: useFeatureFlagEnabledMock,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useRouteContext: ({
      select,
    }: {
      select: (context: { profileViewNewEnabled: boolean }) => boolean
    }) => select({ profileViewNewEnabled: routeContextFlagMock() }),
    useParams: () => ({ name: 'example.eth' }),
  }),
  redirect: (options: unknown) => ({ options }),
}))

vi.mock('@/features/profile/service/profileExpiry', () => ({
  profileExpiryQuery: vi.fn(),
}))

vi.mock('@/features/profile/service/profileOwner', () => ({
  profileOwnerQuery: vi.fn(),
}))

vi.mock('@/features/profile/service/profileRecords', () => ({
  profileRecordsQuery: vi.fn(),
}))

vi.mock('@/features/profile/service/profileRegistration', () => ({
  profileRegistrationQuery: vi.fn(),
}))

vi.mock('@/features/profile/service/profileReverseName', () => ({
  profileReverseNameQuery: vi.fn(),
}))

vi.mock('@/features/profile/components/view/ProfileView', () => ({
  ProfileView: ({
    profileViewNewEnabled,
  }: {
    profileViewNewEnabled: boolean
  }) => (
    <div data-testid="profile-view">
      {profileViewNewEnabled ? 'new' : 'legacy'}
    </div>
  ),
}))

vi.mock('@/features/profile/components/view-new/ProfileViewNewLoading', () => ({
  ProfileViewNewLoading: () => <div data-testid="new-profile-loading" />,
}))

vi.mock('@/features/profile/components/common/ProfileLoading', () => ({
  ProfileLoading: () => <div data-testid="legacy-profile-loading" />,
}))

const renderRouteOption = (option: 'component' | 'pendingComponent') => {
  const Component = Route.options[option] as ComponentType
  return render(<Component />)
}

describe('/$name client-rendered profile route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeContextFlagMock.mockReturnValue(false)
    useFeatureFlagEnabledMock.mockImplementation(
      (_flag: string, defaultValue: boolean) => defaultValue,
    )
  })

  it('keeps the profile page and its data client-rendered', () => {
    expect(Route.options.ssr).toBe(false)
  })

  it('uses the server feature flag context as the initial profile selection', () => {
    routeContextFlagMock.mockReturnValue(true)

    renderRouteOption('component')

    expect(screen.getByTestId('profile-view').textContent).toBe('new')
    expect(useFeatureFlagEnabledMock).toHaveBeenCalledWith(
      'profile-view-new',
      true,
    )
  })

  it('allows the client feature flag to supersede the server result', () => {
    routeContextFlagMock.mockReturnValue(true)
    useFeatureFlagEnabledMock.mockReturnValue(false)

    renderRouteOption('component')

    expect(screen.getByTestId('profile-view').textContent).toBe('legacy')
  })

  it('uses the server feature flag context for the pending profile variant', () => {
    routeContextFlagMock.mockReturnValue(true)

    renderRouteOption('pendingComponent')

    expect(screen.getByTestId('new-profile-loading')).not.toBeNull()
    expect(screen.queryByTestId('legacy-profile-loading')).toBeNull()
  })
})
