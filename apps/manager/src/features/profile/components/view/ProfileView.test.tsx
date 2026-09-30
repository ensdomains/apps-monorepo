import { skipToken } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileRecordsResult } from '@/features/profile/service/profileRecords'
import { getDefaultHeaderCover } from '@/features/profile/utils/defaultHeaderCover'
import { render, stubImagePreload } from '@/utils/test-utils'
import { ProfileView } from './ProfileView'

const mocks = vi.hoisted(() => ({
  getProfileRecords: vi.fn<() => Promise<ProfileRecordsResult>>(),
}))

vi.mock('@posthog/react', () => ({ useFeatureFlagEnabled: () => false }))
vi.mock('@/lib/posthog/useMigrationNftEnabled', () => ({
  useMigrationNftEnabled: () => false,
}))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({ isConnected: false }),
}))
vi.mock('@/features/migration/hooks/useEligibleV1Names', () => ({
  useEligibleV1Names: () => ({ eligible: [], isPending: false }),
}))
vi.mock(
  '@/features/migration/components/success/CommemorativeNftProfileSection',
  () => ({ CommemorativeNftProfileSection: () => null }),
)

// Keep the query hooks and image resolution real; isolate network-backed
// profile data and features unrelated to displaying the saved images.
vi.mock('@/features/profile/service/profileRecords', () => ({
  profileRecordsQuery: (name: string) => ({
    queryKey: ['profile-records', name],
    queryFn: mocks.getProfileRecords,
  }),
}))
vi.mock('@/features/profile/service/profileOwner', () => ({
  profileOwnerQuery: (name: string) => ({
    queryKey: ['profile-owner', name],
    queryFn: skipToken,
    initialData: null,
  }),
}))
vi.mock('@/features/profile/service/profileExpiry', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/profile/service/profileExpiry')
  >()),
  profileExpiryQuery: (name: string) => ({
    queryKey: ['profile-expiry', name],
    queryFn: skipToken,
    initialData: null,
  }),
}))
vi.mock('@/features/profile/service/profileRegistration', () => ({
  profileRegistrationQuery: (name: string) => ({
    queryKey: ['profile-registration', name],
    queryFn: skipToken,
    initialData: null,
  }),
}))
vi.mock('@/features/profile/service/profileReverseName', () => ({
  profileReverseNameQuery: () => ({
    queryKey: ['profile-reverse-name'],
    queryFn: skipToken,
    initialData: null,
  }),
}))
vi.mock('./ProfileCards', () => ({ ProfileCards: () => null }))
vi.mock('./ProfileStatusBanners', () => ({
  ProfileMigrationBanner: () => null,
  ProfileGracePeriodBanner: () => null,
}))
vi.mock('./ProfileActions', () => ({
  // Simulate the editor's successful-save callback without a wallet transaction.
  ProfileActions: ({ onUpdated }: { onUpdated: () => Promise<unknown> }) => (
    <button onClick={() => void onUpdated()} type="button">
      Save profile
    </button>
  ),
  ProfileMobileActions: () => null,
}))

const savedAvatar = 'https://example.com/avatar.png'
const savedHeader = 'https://example.com/header.png'
const updatedAvatar = 'https://example.com/updated-avatar.png'
const updatedHeader = 'https://example.com/updated-header.png'

const imageRecords = (
  avatar: string,
  header: string,
): ProfileRecordsResult => ({
  texts: [
    { key: 'avatar', value: avatar },
    { key: 'header', value: header },
  ],
  coins: [],
})

const renderProfile = () =>
  render(
    <Suspense fallback={<p>Loading profile</p>}>
      <ProfileView name="example.eth" />
    </Suspense>,
  )

const expectFallbacks = (container: HTMLElement) => {
  expect(
    screen.getAllByRole('img', { name: 'example.eth pattern' }),
  ).toHaveLength(2)
  expect(
    screen.queryByRole('img', { name: 'example.eth avatar' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('img', { name: 'example.eth banner' }),
  ).not.toBeInTheDocument()
  expect(container.querySelector('img[aria-hidden="true"]')).toHaveAttribute(
    'src',
    getDefaultHeaderCover({}),
  )
}

const expectImages = (
  avatar: string,
  header: string,
  container: HTMLElement,
) => {
  const avatars = screen.getAllByRole('img', { name: 'example.eth avatar' })
  expect(avatars).toHaveLength(2)
  for (const image of avatars) {
    expect(image).toHaveAttribute('src', avatar)
  }
  expect(
    screen.getByRole('img', { name: 'example.eth banner' }),
  ).toHaveAttribute('src', header)
  expect(
    screen.queryByRole('img', { name: 'example.eth pattern' }),
  ).not.toBeInTheDocument()
  expect(container.querySelector('img[aria-hidden="true"]')).toBeNull()
}

describe('ProfileView images', () => {
  const probes = stubImagePreload()

  beforeEach(() => {
    mocks.getProfileRecords.mockReset()
    mocks.getProfileRecords.mockResolvedValue(
      imageRecords(savedAvatar, savedHeader),
    )
  })

  const loadImages = async (avatar: string, header: string) => {
    await waitFor(() => {
      expect(probes.filter(({ src }) => src === avatar)).toHaveLength(2)
      expect(probes.filter(({ src }) => src === header)).toHaveLength(1)
    })
    act(() => {
      for (const probe of probes) {
        if (probe.src === avatar || probe.src === header) {
          probe.dispatchEvent(new Event('load'))
        }
      }
    })
  }

  it('renders saved HTTP avatar and header records after the images load', async () => {
    const { container } = renderProfile()

    await screen.findByRole('heading', { name: 'example.eth' })
    expectFallbacks(container)
    await loadImages(savedAvatar, savedHeader)

    expectImages(savedAvatar, savedHeader, container)
  })

  it('shows the pattern avatars and default cover when image records are missing', async () => {
    mocks.getProfileRecords.mockResolvedValue({ texts: [], coins: [] })
    const { container } = renderProfile()

    await screen.findByRole('heading', { name: 'example.eth' })

    expectFallbacks(container)
    expect(probes.every(({ src }) => src === '')).toBe(true)
  })

  it('updates both rendered images when saving refetches changed records', async () => {
    const { container } = renderProfile()
    await loadImages(savedAvatar, savedHeader)
    expectImages(savedAvatar, savedHeader, container)

    mocks.getProfileRecords.mockResolvedValue(
      imageRecords(updatedAvatar, updatedHeader),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await loadImages(updatedAvatar, updatedHeader)

    expect(mocks.getProfileRecords).toHaveBeenCalledTimes(2)
    expectImages(updatedAvatar, updatedHeader, container)
  })

  it('restores the fallbacks when saving clears previously loaded image records', async () => {
    const { container } = renderProfile()
    await loadImages(savedAvatar, savedHeader)
    expectImages(savedAvatar, savedHeader, container)

    mocks.getProfileRecords.mockResolvedValue(imageRecords('', ''))
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => expectFallbacks(container))
    expect(mocks.getProfileRecords).toHaveBeenCalledTimes(2)
  })
})
