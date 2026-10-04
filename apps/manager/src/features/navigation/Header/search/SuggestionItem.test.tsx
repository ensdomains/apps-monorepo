import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EXPLORER_URL } from '@/constants'
import { render } from '@/utils/test-utils'
import { NameSuggestionItem } from './SuggestionItem'

const dnsSecLookups = vi.hoisted(() => [] as string[])

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    children,
    params,
    to,
  }: {
    readonly children: React.ReactNode
    readonly params: { readonly name: string }
    readonly to: string
  }) => <a href={to.replace('$name', params.name)}>{children}</a>,
}))

vi.mock('@/features/shared/service/checkNameAvailabilityService', () => ({
  getSearchNameQueryOptions: (name: string) => ({
    queryKey: ['test-search', name],
    queryFn: async () => ({ name, isAvailable: false }),
  }),
  getNamePricingQueryOptions: (name?: string) => ({
    queryKey: ['test-pricing', name ?? null],
    queryFn: async () => null,
  }),
}))

vi.mock('@/features/profile/service/profileExpiry', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/profile/service/profileExpiry')
  >()),
  profileExpiryQuery: (name: string) => ({
    queryKey: ['test-expiry', name],
    queryFn: async () => null,
  }),
}))

vi.mock('@/features/profile/service/profileOwner', () => ({
  profileOwnerQuery: (name: string) => ({
    queryKey: ['test-owner', name],
    queryFn: async () =>
      name === 'owned.xyz'
        ? {
            owner: '0x0000000000000000000000000000000000000001',
            protocol: 'v1',
          }
        : null,
  }),
}))

vi.mock('@/features/search/nameIndexStatus', () => ({
  nameIndexStatusQuery: (name: string) => ({
    queryKey: ['test-name-index-status', name],
    queryFn: async () => 'not_indexed',
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

describe('NameSuggestionItem', () => {
  beforeEach(() => {
    dnsSecLookups.length = 0
  })

  it('links an unimported DNS 2LD to Explorer instead of not found', async () => {
    render(<NameSuggestionItem name="vitalik.xyz" />)

    const cta = await screen.findByText('View in Explorer')
    expect(screen.queryByText('Name not found')).not.toBeInTheDocument()
    const link = cta.closest('a')
    expect(link).toHaveAttribute('href', `${EXPLORER_URL}/vitalik.xyz`)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(dnsSecLookups).toEqual(['xyz'])
  })

  it('keeps an unowned name under an unsupported TLD as not found', async () => {
    render(<NameSuggestionItem name="vitalik.ethh" />)

    expect(await screen.findByText('Name not found')).toBeInTheDocument()
    expect(screen.queryByText('View in Explorer')).not.toBeInTheDocument()
  })

  it('still links to Explorer when the TLD support lookup fails', async () => {
    render(<NameSuggestionItem name="vitalik.fail" />)

    const cta = await screen.findByText('View in Explorer')
    expect(cta.closest('a')).toHaveAttribute(
      'href',
      `${EXPLORER_URL}/vitalik.fail`,
    )
  })

  it('keeps an unowned DNS subname as not found', async () => {
    render(<NameSuggestionItem name="sub.vitalik.xyz" />)

    expect(await screen.findByText('Name not found')).toBeInTheDocument()
    expect(screen.queryByText('View in Explorer')).not.toBeInTheDocument()
    expect(dnsSecLookups).toEqual([])
  })

  it('keeps an unowned .eth subname as not found', async () => {
    render(<NameSuggestionItem name="missing.alice.eth" />)

    expect(await screen.findByText('Name not found')).toBeInTheDocument()
  })

  it('links an owned DNS name to its profile', async () => {
    render(<NameSuggestionItem name="owned.xyz" />)

    const badge = await screen.findByText('Registered')
    expect(badge.closest('a')).toHaveAttribute('href', '/owned.xyz')
    expect(dnsSecLookups).toEqual([])
  })
})
