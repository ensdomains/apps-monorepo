import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { NamesTable } from './NamesTable'

const mocks = vi.hoisted(() => ({
  getFavorites: vi.fn(),
  isAuthed: { current: true },
  subnamesTotal: { current: 2 },
}))

vi.mock('@/utils/backend-client', async () => {
  const { createStore } = await import('@xstate/store-react')
  const authStore = createStore({ context: { isAuthed: true }, on: {} })
  return {
    isBackendAuthed: authStore.select(
      (context) => context.isAuthed && mocks.isAuthed.current,
    ),
    backendClient: { favorites: { $get: mocks.getFavorites } },
  }
})
vi.mock('@/features/bulk-renew', () => ({ BulkRenewDialog: () => null }))
vi.mock('../useDashboardNames', () => ({
  useDashboardAddresses: () => [],
  useDashboardNames: ({
    isSubnamesOnly,
  }: {
    readonly isSubnamesOnly?: boolean
  }) => ({
    total: isSubnamesOnly ? mocks.subnamesTotal.current : 5,
    isPending: false,
    isError: false,
    isComplete: true,
  }),
}))
vi.mock('./MyNamesList', () => ({
  MyNamesList: ({ isSubnamesOnly }: { readonly isSubnamesOnly?: boolean }) => (
    <div data-testid="my-names">
      {isSubnamesOnly ? 'subnames only' : 'every name'}
    </div>
  ),
}))
vi.mock('./FavoritesList', () => ({ FavoritesList: () => null }))

describe('NamesTable', () => {
  beforeEach(() => {
    mocks.subnamesTotal.current = 2
    mocks.isAuthed.current = true
    // The favorites read never answers: the chip stays loading.
    mocks.getFavorites.mockReturnValue(new Promise(() => undefined))
  })

  it('keeps the Favorites chip while favorites are still loading', () => {
    render(<NamesTable />)

    expect(screen.getByRole('button', { name: /^Favorites/ })).toBeVisible()
  })

  it('hides Favorites while signed out, as it has nothing to show', () => {
    mocks.isAuthed.current = false
    render(<NamesTable />)

    expect(screen.queryByRole('button', { name: /^Favorites/ })).toBeNull()
  })

  it('does not reopen a filter that emptied once it has names again', () => {
    const { rerender } = render(<NamesTable />)
    fireEvent.click(screen.getByRole('button', { name: /^Subnames/ }))
    expect(screen.getByTestId('my-names')).toHaveTextContent('subnames only')

    mocks.subnamesTotal.current = 0
    rerender(<NamesTable />)
    expect(screen.getByTestId('my-names')).toHaveTextContent('every name')

    mocks.subnamesTotal.current = 1
    rerender(<NamesTable />)
    expect(screen.getByTestId('my-names')).toHaveTextContent('every name')
  })
})
