import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EXPLORER_URL } from '@/constants'
import { CheckAvailability } from '@/features/landing/check-availability/CheckAvailability'
import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import { render, stubImagePreload } from '@/utils/test-utils'

const dnsSecLookups = vi.hoisted(() => [] as string[])

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

vi.mock('@/features/profile/service/profileOwner', () => ({
  profileOwnerQuery: (name: string) => ({
    queryKey: ['test-owner', name],
    queryFn: async () =>
      name === '1.1.sugh004.eth'
        ? {
            owner: '0x0000000000000000000000000000000000000001',
            protocol: 'v2',
          }
        : null,
  }),
}))

vi.mock('@/features/shared/service/nameDetail', () => ({
  getNameDetailQueryOptions: () => ({
    queryKey: ['test-name-detail'],
    queryFn: async () => null,
  }),
}))

vi.mock('@/features/profile/service/dnsSecEnabled', () => ({
  dnsSecEnabledQuery: (tld: string) => ({
    queryKey: ['test-dnssec', tld],
    queryFn: async () => {
      dnsSecLookups.push(tld)
      if (tld === 'fail') throw new Error('DoH lookup failed')
      return tld !== 'ethh'
    },
    retry: false,
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

    // The raw input differs from the resolved name on purpose: the avatar
    // url must be built from the availability result's normalized name.
    searchFor('alien')

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

    searchFor('alien')

    await waitFor(() => {
      expect(screen.getByText('Grace period')).toBeInTheDocument()
    })

    expect(probes.some((p) => p.src === expectedAvatarUrl)).toBe(true)
  })

  it('does not mark a deep subname as not supported', async () => {
    render(<CheckAvailability />)

    searchFor('1.1.sugh004.eth')

    await waitFor(() => {
      expect(screen.getByText('1.1.sugh004.eth')).toBeInTheDocument()
    })
    expect(screen.queryByText('Not supported')).not.toBeInTheDocument()
  })

  it('shows a not-found state for an unowned subname', async () => {
    render(<CheckAvailability />)

    searchFor('missing.alice.eth')

    await waitFor(() => {
      expect(screen.getByText('Name not found')).toBeInTheDocument()
    })
  })

  it('links an unimported DNS 2LD to Explorer instead of not found', async () => {
    render(<CheckAvailability />)

    searchFor('vitalik.xyz')

    const cta = await screen.findByText('View in Explorer')
    expect(screen.queryByText('Name not found')).not.toBeInTheDocument()
    const link = cta.closest('a')
    expect(link).toHaveAttribute('href', `${EXPLORER_URL}/vitalik.xyz`)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('keeps the not-found state for a typo TLD', async () => {
    render(<CheckAvailability />)

    searchFor('vitalik.ethh')

    await waitFor(() => {
      expect(screen.getByText('Name not found')).toBeInTheDocument()
    })
    expect(screen.queryByText('View in Explorer')).not.toBeInTheDocument()
  })

  it('keeps the not-found state for an unowned DNS subname', async () => {
    render(<CheckAvailability />)

    searchFor('sub.vitalik.xyz')

    await waitFor(() => {
      expect(screen.getByText('Name not found')).toBeInTheDocument()
    })
    expect(screen.queryByText('View in Explorer')).not.toBeInTheDocument()
  })
})
