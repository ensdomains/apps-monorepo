import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CheckAvailability } from '@/features/landing/check-availability/CheckAvailability'
import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import { render, stubImagePreload } from '@/utils/test-utils'

const fixtures = vi.hoisted(() => ({
  expiry: null as {
    expiry: bigint
    isNonExpiring: boolean
    protocol: 'v1' | 'v2'
  } | null,
}))

vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: string) => ({ debouncedValue: value }),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ children }: { readonly children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
}))

vi.mock('@/features/shared/service/checkNameAvailabilityService', () => ({
  getSearchNameQueryOptions: (name: string) => ({
    queryKey: ['test-search', name],
    queryFn: async () => ({ name: 'alien.eth', isAvailable: false }),
  }),
  getNamePricingQueryOptions: (name?: string) => ({
    queryKey: ['test-pricing', name ?? null],
    queryFn: async () => null,
  }),
}))

vi.mock('@/features/profile/service/profileRecords', () => ({
  profileRecordsQuery: (name: string) => ({
    queryKey: ['test-records', name],
    queryFn: async () => ({ texts: [{ key: 'theme', value: '#112233' }] }),
  }),
}))

vi.mock('@/features/profile/service/profileExpiry', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/profile/service/profileExpiry')
  >()),
  profileExpiryQuery: (name: string) => ({
    queryKey: ['test-expiry', name],
    queryFn: async () => fixtures.expiry,
  }),
}))

vi.mock('@/features/profile/service/profileRegistration', () => ({
  profileRegistrationQuery: (name: string) => ({
    queryKey: ['test-registration', name],
    queryFn: async () => null,
  }),
}))

vi.mock('@/features/profile/service/profileReverseName', () => ({
  profileReverseNameQuery: (address?: string) => ({
    queryKey: ['test-reverse', address ?? null],
    queryFn: async () => null,
  }),
}))

const searchFor = (name: string) => {
  fireEvent.change(screen.getByPlaceholderText('.eth'), {
    target: { value: name },
  })
}

const DAY_IN_SECONDS = 86_400
const nowInSeconds = () => Math.floor(Date.now() / 1000)

describe('CheckAvailability', () => {
  const probes = stubImagePreload()

  it('requests the searched name’s avatar and renders it in the result card', async () => {
    fixtures.expiry = {
      expiry: BigInt(nowInSeconds() + 365 * DAY_IN_SECONDS),
      isNonExpiring: false,
      protocol: 'v2',
    }
    const expectedAvatarUrl = buildNameAvatarUrl('alien.eth')
    const { container } = render(<CheckAvailability />)

    searchFor('alien.eth')

    await waitFor(() => {
      expect(
        container.querySelector('img[alt="alien.eth pattern"]'),
      ).toBeInTheDocument()
    })

    const probe = probes.find((p) => p.src === expectedAvatarUrl)
    expect(probe).toBeDefined()
    expect(screen.queryByText('Grace period')).not.toBeInTheDocument()

    act(() => {
      probe?.dispatchEvent(new Event('load'))
    })

    expect(
      container.querySelector(`img[src="${expectedAvatarUrl}"]`),
    ).toBeInTheDocument()
  })

  it('still requests the avatar for a name in its grace period', async () => {
    fixtures.expiry = {
      expiry: BigInt(nowInSeconds() - 5 * DAY_IN_SECONDS),
      isNonExpiring: false,
      protocol: 'v2',
    }
    const expectedAvatarUrl = buildNameAvatarUrl('alien.eth')
    render(<CheckAvailability />)

    searchFor('alien.eth')

    await waitFor(() => {
      expect(screen.getByText('Grace period')).toBeInTheDocument()
    })

    expect(probes.some((p) => p.src === expectedAvatarUrl)).toBe(true)
  })
})
