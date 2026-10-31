import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileAddressName } from '@/features/profile/service/buildProfileAddressNames'
import { render } from '@/utils/test-utils'

const namesMock = vi.hoisted(() => ({ useProfileAddressNames: vi.fn() }))

vi.mock('@/features/profile/hooks/useProfileAddressNames', () => namesMock)

const eligibilityMock = vi.hoisted(() => ({
  useDashboardMigrationEligibility: vi.fn(),
}))

// Reads the connected wallet and the chain; only its key sets matter here.
vi.mock(
  '@/features/dashboard/useDashboardMigrationEligibility',
  () => eligibilityMock,
)

// Reads the smart-account context, which this component does not otherwise need.
vi.mock('@/hooks/useFeatureFlag', () => ({ useFeatureFlag: () => false }))

// Renders a router `Link`. The toolbar is what is under test, so a row here is
// just its label.
vi.mock('@/features/dashboard/components/NameRow', () => ({
  NameRow: ({
    label,
    status,
  }: {
    readonly label: string
    readonly status?: string | null
  }) => <span data-status={status ?? 'none'}>{label}</span>,
  NameRowSkeleton: () => null,
}))

// eslint-disable-next-line import/first
import { AddressProfileNamesList } from './AddressProfileNamesList'

const ADDRESS = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'

const name = (
  label: string,
  roleCategory: ProfileAddressName['roleCategory'] = 'owned',
): ProfileAddressName => ({
  key: `${label}-${roleCategory}`,
  label,
  protocol: 'v2',
  expiryDate: null,
  createdAt: null,
  nameRoles: roleCategory === 'owned' ? ['owner'] : ['manager'],
  roleCategory,
})

const PAGE = [name('alpha.eth'), name('beta.eth'), name('gamma.eth')]

beforeEach(() => {
  eligibilityMock.useDashboardMigrationEligibility.mockReturnValue({
    eligibleKeys: new Set(),
    upgradeableKeys: new Set(),
    isPending: false,
    isError: false,
  })
  namesMock.useProfileAddressNames.mockReset()
  namesMock.useProfileAddressNames.mockReturnValue({
    pageNames: PAGE,
    total: PAGE.length,
    counts: { owned: 3, managed: 2 },
    isPending: false,
    isPagePending: false,
    isError: false,
    isPlaceholderData: false,
    loadPage: vi.fn(),
  })
})

const renderList = (isConnectedView: boolean) =>
  render(
    <AddressProfileNamesList
      address={ADDRESS}
      isConnectedView={isConnectedView}
    />,
  )

const searchBox = () => screen.getByPlaceholderText('Search names')
const lastRequest = () =>
  namesMock.useProfileAddressNames.mock.calls.at(-1)?.[0]

describe('AddressProfileNamesList', () => {
  // WEB-1320: the search box was inside the connected-view branch, so visiting
  // someone else's address left no way to navigate a long list of names.
  it('offers the search box on an address that is not the connected one', () => {
    renderList(false)

    expect(searchBox()).toBeVisible()
    expect(screen.getByText('Names')).toBeVisible()
  })

  it('lists every name of someone else, newest first, and searches them on bigname', async () => {
    renderList(false)

    expect(screen.getByText('alpha.eth')).toBeInTheDocument()
    expect(lastRequest()).toEqual({
      address: ADDRESS,
      scope: 'all',
      sortField: 'created',
      sortDir: 'desc',
      search: '',
      page: 1,
    })

    fireEvent.change(searchBox(), { target: { value: 'alph' } })

    await waitFor(() => expect(lastRequest()?.search).toBe('alph'))
  })

  // Sorting and the role chips act on roles the viewer holds, so they stay
  // with the connected view — only the search moved out of it.
  it('keeps the role filter chips off an address that is not the connected one', () => {
    renderList(false)

    expect(screen.queryByRole('button', { name: /owned/i })).toBeNull()
  })

  it('shows the role chips with their counts on the connected address and reads the chosen list', () => {
    renderList(true)

    expect(lastRequest()?.scope).toBe('owned')
    expect(screen.getByRole('button', { name: /owned/i })).toHaveTextContent(
      '3',
    )

    fireEvent.click(screen.getByRole('button', { name: /managed/i }))

    expect(lastRequest()).toMatchObject({ scope: 'managed', page: 1 })
  })

  it('reads the page it moves to', () => {
    const loadPage = vi.fn()
    namesMock.useProfileAddressNames.mockReturnValue({
      pageNames: PAGE,
      total: 12,
      counts: { owned: 12, managed: 0 },
      isPending: false,
      isPagePending: false,
      isError: false,
      isPlaceholderData: false,
      loadPage,
    })

    renderList(false)
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }))

    expect(loadPage).toHaveBeenCalledWith(2)
    expect(lastRequest()).toMatchObject({ page: 2 })
  })

  it('goes back to the first page on another address', () => {
    namesMock.useProfileAddressNames.mockReturnValue({
      pageNames: PAGE,
      total: 12,
      counts: { owned: 12, managed: 0 },
      isPending: false,
      isPagePending: false,
      isError: false,
      isPlaceholderData: false,
      loadPage: vi.fn(),
    })

    const { rerender } = renderList(false)
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }))
    expect(lastRequest()).toMatchObject({ page: 2 })

    rerender(
      <AddressProfileNamesList
        address="0x0000000000000000000000000000000000000001"
        isConnectedView={false}
      />,
    )

    expect(lastRequest()).toMatchObject({
      address: '0x0000000000000000000000000000000000000001',
      page: 1,
    })
  })

  it('shows skeletons rather than an empty list while a page is still being read', () => {
    namesMock.useProfileAddressNames.mockReturnValue({
      pageNames: [],
      total: 12,
      counts: { owned: 12, managed: 0 },
      isPending: false,
      isPagePending: true,
      isError: false,
      isPlaceholderData: false,
      loadPage: vi.fn(),
    })

    renderList(true)

    expect(screen.queryByText('No names to display')).not.toBeInTheDocument()
  })
})

describe('AddressProfileNamesList ENSv1 labels', () => {
  const v1 = (label: string, key: string): ProfileAddressName => ({
    ...name(label),
    key,
    protocol: 'v1',
  })
  const MIXED = [
    v1('mine.eth', '0xaa'),
    v1('theirs.eth', '0xbb'),
    v1('stuck.eth', '0xcc'),
    name('upgraded.eth'),
  ]
  const statuses = () =>
    MIXED.map(({ label }) => screen.getByText(label).dataset.status)

  beforeEach(() => {
    namesMock.useProfileAddressNames.mockReturnValue({
      pageNames: MIXED,
      total: MIXED.length,
      counts: { owned: 4, managed: 0 },
      isPending: false,
      isPagePending: false,
      isError: false,
      isPlaceholderData: false,
      loadPage: vi.fn(),
    })
  })

  it('labels each ENSv1 name by who can upgrade it, for the address viewed', () => {
    eligibilityMock.useDashboardMigrationEligibility.mockReturnValue({
      eligibleKeys: new Set(['0xaa']),
      upgradeableKeys: new Set(['0xaa', '0xbb']),
      isPending: false,
      isError: false,
    })

    renderList(false)

    expect(
      eligibilityMock.useDashboardMigrationEligibility,
    ).toHaveBeenCalledWith({ address: ADDRESS })
    expect(statuses()).toEqual([
      'eligibleUpgrade',
      'ensv1',
      'ensv1Only',
      'none',
    ])
  })

  it('shows no ENSv1 label until the check settles', () => {
    eligibilityMock.useDashboardMigrationEligibility.mockReturnValue({
      eligibleKeys: new Set(),
      upgradeableKeys: new Set(),
      isPending: true,
      isError: false,
    })

    renderList(false)

    expect(statuses()).toEqual(['none', 'none', 'none', 'none'])
  })
})
