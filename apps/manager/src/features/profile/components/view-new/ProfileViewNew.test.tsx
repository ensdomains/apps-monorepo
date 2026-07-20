import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnection } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account'
import { ProfileViewNew } from './ProfileViewNew'

vi.mock('@posthog/react', () => ({
  useFeatureFlagEnabled: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useSuspenseQuery: vi.fn(),
}))

vi.mock('wagmi', () => ({
  useConnection: vi.fn(),
}))

vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: vi.fn(),
}))

vi.mock('@/features/profile/utils/defaultHeaderCover', () => ({
  getDefaultHeaderCover: () => 'default-header-url',
}))

vi.mock('@/features/profile/utils/transformRecords', () => ({
  transformProfileRecords: () => ({
    base: {
      header: null,
      theme: null,
    },
  }),
}))

vi.mock('@/features/profile/utils/themeColor', () => ({
  getThemeVars: () => ({ '--theme-color': undefined }),
}))

vi.mock('@/features/profile/service/profileExpiry', () => ({
  getProfileExpiryResultStatus: () => ({
    displayExpiryDate: null,
    isInGrace: false,
  }),
  profileExpiryQuery: () => ({}),
}))

vi.mock('@/features/profile/service/profileOwner', () => ({
  profileOwnerQuery: () => ({}),
}))

vi.mock('@/features/profile/service/profileRecords', () => ({
  profileRecordsQuery: () => ({}),
}))

vi.mock('@/features/profile/service/profileRegistration', () => ({
  profileRegistrationQuery: () => ({}),
}))

vi.mock('@/features/profile/service/profileReverseName', () => ({
  profileReverseNameQuery: () => ({}),
}))

vi.mock('./ProfileViewNewLoading', () => ({
  ProfileViewNewLoading: ({ name }: { name: string }) => (
    <div data-testid="profile-view-new-loading">{name}</div>
  ),
}))

vi.mock('./ProfileViewNewActions', () => ({
  ProfileViewNewActions: () => null,
}))

vi.mock('./ProfileViewNewBanner', () => ({
  ProfileViewNewBanner: () => null,
}))

vi.mock('./ProfileViewNewCards', () => ({
  ProfileViewNewCards: () => null,
}))

vi.mock('./ProfileViewNewHeader', () => ({
  ProfileViewNewHeader: () => null,
}))

vi.mock('./ProfileViewNewStatusBanners', () => ({
  ProfileViewNewStatusBanners: ({
    isMigrationEnabled,
  }: {
    isMigrationEnabled: boolean
  }) => (
    <div data-testid="profile-view-new-status-banners">
      {String(isMigrationEnabled)}
    </div>
  ),
}))

vi.mock('./ProfileViewNewThemeColor', () => ({
  ProfileViewNewThemeColorProvider: ({
    children,
  }: {
    children: React.ReactNode
  }) => <>{children}</>,
}))

describe('ProfileViewNew', () => {
  beforeEach(() => {
    vi.mocked(useFeatureFlagEnabled).mockReturnValue(true)
    vi.mocked(useSuspenseQuery).mockReturnValue({
      data: {},
      refetch: vi.fn(),
    } as never)
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isError: false,
      isPending: true,
    } as never)
    vi.mocked(useConnection).mockReturnValue({ address: undefined } as never)
    vi.mocked(useSmartAccountContext).mockReturnValue({
      accountAddress: undefined,
      ownerAddress: undefined,
    } as never)
  })

  it('renders with migration banners disabled when migration access is unresolved', () => {
    vi.mocked(
      useFeatureFlagEnabled as (flag: string) => boolean | undefined,
    ).mockReturnValue(undefined)

    render(<ProfileViewNew name="test.eth" />)

    expect(screen.queryByTestId('profile-view-new-loading')).toBeNull()
    expect(
      screen.getByTestId('profile-view-new-status-banners').textContent,
    ).toBe('false')
  })
})
