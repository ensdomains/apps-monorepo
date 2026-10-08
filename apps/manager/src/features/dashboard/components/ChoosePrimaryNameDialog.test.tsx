import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { ok } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NavSection } from '@/features/navigation/Header/account/NavSection'
import { render } from '@/utils/test-utils'
import { DashboardPage } from '../pages/DashboardPage'
import { MyNamesList } from './MyNamesList'

type NameQueryParams = { readonly name: string }

const recordsQueryKey = createQueryKey<'records', NameQueryParams>('records')
const accessQueryKey = createQueryKey<'access', NameQueryParams>('access')
const registrationQueryKey = createQueryKey<'registration', NameQueryParams>(
  'registration',
)
const expiryQueryKey = createQueryKey<'expiry', NameQueryParams>('expiry')
const rowRecordsQueryKey = createQueryKey<'row-records', NameQueryParams>(
  'row-records',
)

const chain = vi.hoisted(() => ({
  primaryName: 'alpha.eth' as string | null,
  owner: '0x0000000000000000000000000000000000000001',
  read: vi.fn(),
  submit: vi.fn(),
}))

// Keep the real reverse query, QueryClient, chooser, useSetPrimaryName mutation,
// Dashboard, card, MyNamesList and NavSection. Stub only IO and unrelated panels.
vi.mock('viem/actions', async (original) => ({
  ...(await original<typeof import('viem/actions')>()),
  getEnsName: () => chain.read(),
}))
vi.mock('@/lib/wagmi/helpers', () => ({ safeGetClient: () => ok({}) }))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({
    ownerAddress: chain.owner,
    walletClient: { account: { address: chain.owner } },
  }),
}))
vi.mock('@/features/profile/service/setPrimaryName', () => ({
  setPrimaryName: (args: { readonly name: string }) => chain.submit(args),
  setPrimaryNameWithHca: vi.fn(),
}))
vi.mock('@/features/profile/service/primaryNamePreparation', () => ({
  getPrimaryNamePreparation: async () => ({ kind: 'ready' }),
}))
vi.mock('@/features/profile/service/profileRecords', () => ({
  profileRecordsQuery: (name: string) => ({
    queryKey: recordsQueryKey({ name }),
    queryFn: async () => ({ texts: [] }),
  }),
}))
vi.mock('@/features/profile/service/resolverWriteAccess', () => ({
  resolverWriteAccessQuery: (name: string) => ({
    queryKey: accessQueryKey({ name }),
    queryFn: async () => true,
  }),
}))
vi.mock('@/features/profile/service/profileRegistration', () => ({
  profileRegistrationQuery: (name: string) => ({
    queryKey: registrationQueryKey({ name }),
    queryFn: async () => null,
  }),
}))
vi.mock('@/features/profile/service/profileExpiry', () => ({
  profileExpiryQuery: (name: string) => ({
    queryKey: expiryQueryKey({ name }),
    queryFn: async () => null,
  }),
  getProfileExpiryResultStatus: () => ({
    isInGrace: false,
    displayExpiryDate: null,
  }),
}))
vi.mock('./nameRowRecordsQuery', () => ({
  nameRowRecordsQuery: (name: string) => ({
    queryKey: rowRecordsQueryKey({ name }),
    queryFn: async () => ({ texts: [] }),
  }),
}))
vi.mock('../hooks/usePrimaryNameDomains', () => ({
  usePrimaryNameDomains: () => ({
    domains: ['alpha.eth', 'beta.eth'].map((name) => ({
      id: name,
      name,
      normalizedName: name,
    })),
    isLoading: false,
    isSelectedNameOffered: true,
    hasForwardAddressError: false,
    searchQuery: '',
    onSearchChange: vi.fn(),
    currentPage: 1,
    totalPages: 1,
    rangeStart: 1,
    rangeEnd: 2,
    total: 2,
    onPageChange: vi.fn(),
  }),
}))
vi.mock('../useOwnedDomains', () => ({
  useOwnedDomains: () => ({
    v2Names: ['alpha.eth', 'beta.eth'].map((name) => ({
      id: name,
      name,
      normalizedName: name,
      createdAt: 0,
      expiryDate: 2_000_000_000,
      owner: { id: chain.owner },
      resolver: null,
    })),
    isPending: false,
    isError: false,
  }),
}))
vi.mock('../useDashboardV1Names', () => ({
  useDashboardV1Names: () => ({
    v1Names: [],
    isPending: false,
    isError: false,
  }),
}))
vi.mock('./NamesTable', () => ({
  NamesTable: ({ primaryLabel }: { readonly primaryLabel: string | null }) => (
    <section aria-label="My Names">
      <MyNamesList
        favoriteLabels={new Set()}
        isAuthenticated
        migrationEnabled={false}
        onToggleFavorite={() => undefined}
        primaryLabel={primaryLabel}
        sort="name-asc"
      />
    </section>
  ),
}))
vi.mock('@posthog/react', () => ({ useFeatureFlagEnabled: () => false }))
vi.mock('@/lib/posthog/useMigrationNftEnabled', () => ({
  useMigrationNftEnabled: () => false,
}))
vi.mock('./DashboardGraceBanner', () => ({ DashboardGraceBanner: () => null }))
vi.mock('./TemporaryMigrationAccessNotice', () => ({
  TemporaryMigrationAccessNotice: () => null,
}))
vi.mock('./EducationCarousel', () => ({ EducationCarousel: () => null }))
vi.mock('./FaqSection', () => ({ FaqSection: () => null }))

const renderDashboard = async () => {
  const root = createRootRoute({
    component: () => (
      <>
        <DashboardPage />
        <NavSection
          onAction={() => undefined}
          onChoosePrimaryName={() => undefined}
        />
      </>
    ),
  })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

const expectPrimary = async (name: string) => {
  await waitFor(() => {
    expect(
      screen.getByRole('link', { name: /Go to profile/i }),
    ).toHaveAttribute('href', `/${name}`)
    expect(
      screen.getByRole('link', { name: 'Primary Name Profile' }),
    ).toHaveAttribute('href', `/${name}`)
    const list = screen.getByRole('region', { name: 'My Names' })
    const action = within(list).getByRole('button', { name: 'Primary Name' })
    // The action belongs to the row with this profile link, not the other row.
    expect(
      action.parentElement?.parentElement?.parentElement,
    ).toHaveTextContent(name)
  })
}

describe('chooser completion refreshes the wallet-scoped surfaces', () => {
  beforeEach(() => {
    chain.primaryName = 'alpha.eth'
    chain.read.mockReset().mockImplementation(async () => chain.primaryName)
    chain.submit
      .mockReset()
      .mockImplementation(async ({ name }: { readonly name: string }) => {
        chain.primaryName = name
      })
  })

  it.each([
    'alpha.eth',
    null,
  ])('refetches shared reverse name after success starting from %s', async (initial) => {
    chain.primaryName = initial
    await renderDashboard()
    if (initial) await expectPrimary(initial)
    const trigger = initial
      ? (await screen.findAllByRole('button', { name: 'Primary Name' }))[0]!
      : await screen.findByRole('button', { name: 'Set primary name' })
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', {
      name: 'Choose Primary Name',
    })
    expect(dialog).toHaveAccessibleDescription(
      'Your wallet address can only have one primary ENS name, which will display instead of your wallet address across apps and wallets.',
    )
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Select beta.eth as primary name',
      }),
    )
    const confirm = within(dialog).getByRole('button', {
      name: 'Set as Primary',
    })
    await waitFor(() => expect(confirm).toBeEnabled())
    const readsBefore = chain.read.mock.calls.length
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(chain.submit).toHaveBeenCalledOnce()
    expect(chain.read.mock.calls.length).toBeGreaterThan(readsBefore)
    await expectPrimary('beta.eth')
  })

  it('keeps focus in My Names when the reverse-name refetch settles after close', async () => {
    await renderDashboard()
    await expectPrimary('alpha.eth')
    const list = screen.getByRole('region', { name: 'My Names' })
    const trigger = within(list).getByRole('button', { name: 'Primary Name' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', {
      name: 'Choose Primary Name',
    })
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Select beta.eth as primary name',
      }),
    )
    const confirm = within(dialog).getByRole('button', {
      name: 'Set as Primary',
    })
    await waitFor(() => expect(confirm).toBeEnabled())

    let finishReverseRead: (name: string) => void = () => undefined
    const pendingRead = new Promise<string>((resolve) => {
      finishReverseRead = resolve
    })
    chain.submit.mockImplementation(async () => {
      chain.primaryName = 'beta.eth'
      chain.read.mockReturnValue(pendingRead)
    })
    fireEvent.click(confirm)
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    await waitFor(() =>
      expect(list.contains(document.activeElement)).toBe(true),
    )
    finishReverseRead('beta.eth')
    await expectPrimary('beta.eth')
    expect(list.contains(document.activeElement)).toBe(true)
  })

  it('keeps current surfaces and chooser on transaction failure', async () => {
    chain.submit.mockRejectedValue(new Error('Wallet rejected'))
    await renderDashboard()
    await expectPrimary('alpha.eth')
    fireEvent.click(screen.getAllByRole('button', { name: 'Primary Name' })[0]!)
    const dialog = await screen.findByRole('dialog', {
      name: 'Choose Primary Name',
    })
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Select beta.eth as primary name',
      }),
    )
    const confirm = within(dialog).getByRole('button', {
      name: 'Set as Primary',
    })
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)
    expect(
      await within(dialog).findByText('Wallet rejected'),
    ).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await expectPrimary('alpha.eth')
  })
})
