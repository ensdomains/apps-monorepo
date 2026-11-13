import type { LookupRequest } from '@ens-apps/indexer/bigname'
import { fireEvent, screen } from '@testing-library/react'
import { errAsync, okAsync } from 'neverthrow'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { render } from '@/utils/test-utils'
import { NamesTable } from './NamesTable'

const io = vi.hoisted(() => ({
  owner: vi.fn(),
  favorites: vi.fn(),
  isAuthed: { current: true },
  subnamesTotal: { current: 2 },
}))
beforeEach(() => {
  vi.clearAllMocks()
  io.favorites.mockReset()
  io.owner.mockResolvedValue({ protocol: 'v1' })
  io.isAuthed.current = true
  io.subnamesTotal.current = 2
})

vi.mock(import('@xstate/store-react'), async (importOriginal) => ({
  ...(await importOriginal()),
  useAtom: () => io.isAuthed.current,
}))
vi.mock('../useDashboardNames', () => ({
  useDashboardAddresses: () => [],
  useDashboardNames: ({
    isSubnamesOnly,
  }: {
    readonly isSubnamesOnly?: boolean
  } = {}) => ({
    total: isSubnamesOnly ? io.subnamesTotal.current : 5,
    isPending: false,
    isError: false,
    isComplete: true,
  }),
}))
vi.mock('@/features/bulk-renew', () => ({ BulkRenewDialog: () => null }))
vi.mock('./MyNamesList', () => ({
  MyNamesList: ({ isSubnamesOnly }: { readonly isSubnamesOnly?: boolean }) => (
    <div data-testid="my-names">
      {isSubnamesOnly ? 'subnames only' : 'every name'}
    </div>
  ),
}))
vi.mock('../service/queries/getFavorites', () => ({
  favoritesQueryOptions: {
    queryKey: [{ service: 'test-favorites' }],
    // As the real options: an empty list until the first read lands.
    placeholderData: [],
    queryFn: async () =>
      io.favorites() ?? [
        ...Array.from({ length: 6 }, (_, index) => ({
          name: `old-${index}.eth`,
          created_at: '2026-01-01',
        })),
        { name: 'v2.eth', created_at: '2026-01-01' },
      ],
  },
}))
vi.mock('@/lib/bigname', () => ({
  bigname: {
    lookup: vi.fn(({ inputs, profile }: LookupRequest) => {
      if (
        inputs.some(
          (input) => 'name' in input && input.name === 'z-missing.eth',
        )
      )
        return errAsync(new Error('Lookup unavailable'))
      return okAsync({
        data: inputs.flatMap((input) => {
          if (!('name' in input)) return []
          const { name } = input
          if (name === 'old-5.eth')
            return [{ input, kind: 'name', status: 'not_found' }]
          const authority =
            name === 'v2.eth' || name.startsWith('a-v2-') ? 'ens_v2' : 'ens_v1'
          const recordAuthority = profile === 'detail' ? authority : undefined
          return [
            {
              input,
              kind: 'name',
              status: 'ok',
              record: {
                name,
                display_name: name,
                namespace: 'ens',
                namehash: '0x01',
                read_status: 'ok',
                authority: recordAuthority,
              },
            },
          ]
        }),
      })
    }),
  },
}))
vi.mock('@/features/profile/service/profileOwner', () => ({
  profileOwnerQuery: (name: string) => ({
    queryKey: [{ service: 'test-owner', name }],
    queryFn: () => io.owner(name),
  }),
}))
vi.mock('@/features/profile/service/profileAvatarRecords', () => ({
  profileAvatarRecordsQuery: (name: string) => ({
    queryKey: [{ service: 'test-records', name }],
    queryFn: async () => ({ texts: [] }),
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
  }: {
    readonly children: ReactNode
    readonly to: string
  }) => <a href={to}>{children}</a>,
}))

describe('NamesTable version controls', () => {
  it('keeps both version controls and their selection when switching collections', async () => {
    const resolveOwner = vi.fn<(value: { readonly protocol: 'v1' }) => void>()
    io.owner.mockReturnValue(
      new Promise<{ readonly protocol: 'v1' }>((resolve) =>
        resolveOwner.mockImplementation(resolve),
      ),
    )
    // More than a page of favorites, so the version change must leave page 2.
    io.favorites.mockReturnValue([
      ...Array.from({ length: 31 }, (_, index) => ({
        name: `old-${index}.eth`,
        created_at: '2026-01-01',
      })),
      { name: 'v2.eth', created_at: '2026-01-01' },
    ])
    render(<NamesTable />)
    expect(bigname.lookup).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Favorites/ }))
    await screen.findByText('Showing 1-25 of 32')
    expect(bigname.lookup).not.toHaveBeenCalled()
    expect(io.owner).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Showing 26-32 of 32')).toBeInTheDocument()
    expect(screen.getByText('v2.eth')).toBeInTheDocument()
    expect(screen.queryByText('old-0.eth')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'V1' }))
    expect(await screen.findByText('old-0.eth')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading...')
    resolveOwner({ protocol: 'v1' })
    expect(await screen.findByText('Showing 1-25 of 31')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'V1' }))
    expect(screen.getByText('Showing 1-25 of 32')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'V2' }))
    expect(await screen.findByText('v2.eth')).toBeInTheDocument()
    expect(screen.getByText('Showing 1-1 of 1')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search my names'), {
      target: { value: 'old' },
    })
    expect(
      await screen.findByText('No favorites to display'),
    ).toBeInTheDocument()
    // Under Owned the chips carry their counts.
    fireEvent.click(screen.getByRole('button', { name: /^Owned/ }))
    expect(screen.getByRole('button', { name: /^V1/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: /^V2/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: /^Favorites/ }))
    expect(await screen.findByText('v2.eth')).toBeInTheDocument()
    expect(bigname.lookup).toHaveBeenCalledTimes(1)
    expect(io.owner).toHaveBeenCalledTimes(1)
  })

  it('keeps indexed matches when a separate lookup batch fails', async () => {
    io.owner.mockRejectedValue(new Error('Owner unavailable'))
    io.favorites.mockReturnValue([
      ...Array.from({ length: 1000 }, (_, index) => ({
        name: `a-v2-${index}.eth`,
        created_at: '2026-01-01',
      })),
      { name: 'z-missing.eth', created_at: '2026-01-01' },
    ])
    render(<NamesTable />)
    fireEvent.click(screen.getByRole('button', { name: /^Favorites/ }))
    fireEvent.click(screen.getByRole('button', { name: 'V2' }))
    expect(await screen.findByText('a-v2-0.eth')).toBeInTheDocument()
    expect(screen.getByText('Showing 1-25 of 1000')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Some names could not be loaded',
    )
  })
})

describe('NamesTable filters', () => {
  it('keeps the Favorites chip while favorites are still loading', () => {
    io.favorites.mockReturnValue(new Promise(() => undefined))
    render(<NamesTable />)

    expect(screen.getByRole('button', { name: /^Favorites/ })).toBeVisible()
  })

  it('hides Favorites while signed out, as it has nothing to show', () => {
    io.isAuthed.current = false
    render(<NamesTable />)

    expect(screen.queryByRole('button', { name: /^Favorites/ })).toBeNull()
  })

  it('offers select-all for every name but not under Subnames', () => {
    render(<NamesTable />)
    expect(
      screen.getByRole('button', { name: 'Select all names' }),
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /^Subnames/ }))
    expect(
      screen.queryByRole('button', { name: 'Select all names' }),
    ).toBeNull()
  })

  it('does not reopen a filter that emptied once it has names again', () => {
    const { rerender } = render(<NamesTable />)
    fireEvent.click(screen.getByRole('button', { name: /^Subnames/ }))
    expect(screen.getByTestId('my-names')).toHaveTextContent('subnames only')

    io.subnamesTotal.current = 0
    rerender(<NamesTable />)
    expect(screen.getByTestId('my-names')).toHaveTextContent('every name')

    io.subnamesTotal.current = 1
    rerender(<NamesTable />)
    expect(screen.getByTestId('my-names')).toHaveTextContent('every name')
  })

  it('offers Subnames on the owned list only', () => {
    render(<NamesTable />)
    fireEvent.click(screen.getByRole('button', { name: /^Favorites/ }))

    expect(screen.queryByRole('button', { name: /^Subnames/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'V1' })).toBeVisible()
  })
})
