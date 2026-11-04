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
  renewable: vi.fn(),
}))
beforeEach(() => {
  vi.clearAllMocks()
  io.favorites.mockReset()
  io.owner.mockResolvedValue({ protocol: 'v1' })
  io.renewable.mockResolvedValue(true)
})

vi.mock(import('@xstate/store-react'), async (importOriginal) => ({
  ...(await importOriginal()),
  useAtom: () => true,
}))
vi.mock('../useDashboardNames', () => ({
  useDashboardAddresses: () => [],
  useDashboardNames: () => ({ total: 0, isComplete: true }),
}))
vi.mock('@/features/bulk-renew', () => ({ BulkRenewDialog: () => null }))
vi.mock('./MyNamesList', () => ({ MyNamesList: () => null }))
vi.mock('../service/queries/getFavorites', () => ({
  favoritesQueryOptions: {
    queryKey: [{ service: 'test-favorites' }],
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
    lookup: vi.fn(({ inputs }: LookupRequest) => {
      if (
        inputs.some(
          (input) => 'name' in input && input.name === 'z-missing.eth',
        )
      )
        return errAsync(new Error('Lookup unavailable'))
      return okAsync({
        data: inputs.map((input) => ({
          input,
          kind: 'name',
          status:
            'name' in input && input.name === 'old-5.eth' ? 'not_found' : 'ok',
          record:
            'name' in input && input.name !== 'old-5.eth'
              ? {
                  name: input.name,
                  display_name: input.name,
                  namespace: 'ens',
                  namehash: '0x01',
                  read_status: 'ok',
                  authority:
                    input.name === 'v2.eth' || input.name.startsWith('a-v2-')
                      ? 'ens_v2'
                      : 'ens_v1',
                  expires_at: '2030-01-01T00:00:00Z',
                }
              : undefined,
        })),
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
vi.mock('@/features/renew/data/queries/v1Renewable.query', () => ({
  getV1RenewableQueryOptions: (name: string) => ({
    queryKey: [{ service: 'test-renewable', name }],
    queryFn: () => io.renewable(name),
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
    render(<NamesTable />)
    expect(bigname.lookup).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Favorites/ }))
    await screen.findByText('Showing 1-5 of 7')
    expect(await screen.findAllByText('January 1, 2030')).toHaveLength(5)
    expect(bigname.lookup).toHaveBeenCalledTimes(1)
    expect(io.owner).not.toHaveBeenCalled()
    expect(io.renewable).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Showing 6-7 of 7')).toBeInTheDocument()
    expect(screen.getByText('old-5.eth')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'V1' }))
    expect(screen.getByText('old-0.eth')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading...')
    resolveOwner({ protocol: 'v1' })
    expect(await screen.findByText('Showing 1-5 of 6')).toBeInTheDocument()
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More options for old-0.eth' }),
      { button: 0, ctrlKey: false, pointerType: 'mouse' },
    )
    expect(
      await screen.findByRole('link', { name: /Renew name/ }),
    ).toHaveAttribute('href', '/renew-v1/$name')
    expect(io.renewable).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'V1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More options for old-5.eth' }),
      { button: 0, ctrlKey: false, pointerType: 'mouse' },
    )
    expect(
      await screen.findByRole('link', { name: /Renew name/ }),
    ).toHaveAttribute('href', '/renew-v1/$name')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'V2' }))
    expect(await screen.findByText('v2.eth')).toBeInTheDocument()
    expect(screen.getByText('Showing 1-1 of 1')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search my names'), {
      target: { value: 'old' },
    })
    expect(
      await screen.findByText('No favorites to display'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Owned' }))
    expect(screen.getByRole('button', { name: 'V1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: 'V2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: /^Favorites/ }))
    expect(await screen.findByText('v2.eth')).toBeInTheDocument()
    expect(bigname.lookup).toHaveBeenCalledTimes(1)
    expect(io.owner).toHaveBeenCalledTimes(1)
    expect(io.renewable).toHaveBeenCalledTimes(2)
  })

  it('keeps indexed matches when a separate lookup batch fails', async () => {
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
    expect(screen.getByText('Showing 1-5 of 1000')).toBeInTheDocument()
  })
})
