import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import { useEditRecordsLeaveProtection } from './useEditRecordsLeaveProtection'
import { useEditRecordsState } from './useEditRecordsState'

const ORIGINAL_RECORDS: NameRecord[] = []

const Editor = () => {
  const { addRecord, records, changesCount } =
    useEditRecordsState(ORIGINAL_RECORDS)
  useEditRecordsLeaveProtection(changesCount)
  return (
    <>
      <button
        type="button"
        onClick={() => addRecord('text', 'url', 'https://draft.example')}
      >
        Add draft
      </button>
      <output aria-label="Draft value">
        {records.map(({ value }) => value).join(', ')}
      </output>
      <Link to="/$name/records" params={{ name: 'alice.eth' }}>
        Leave editor
      </Link>
    </>
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('record editor leave protection', () => {
  it('keeps actual draft state when normal and programmatic navigation are canceled, then permits confirmed leave', async () => {
    const confirmation = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmation)
    const root = createRootRoute()
    const editor = createRoute({
      getParentRoute: () => root,
      path: '/$name/edit-records',
      component: Editor,
    })
    const records = createRoute({
      getParentRoute: () => root,
      path: '/$name/records',
      component: () => <h1>Records destination</h1>,
    })
    const router = createRouter({
      routeTree: root.addChildren([editor, records]),
      history: createMemoryHistory({
        initialEntries: ['/alice.eth/edit-records'],
      }),
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    await user.click(await screen.findByRole('button', { name: 'Add draft' }))
    await user.click(screen.getByRole('link', { name: 'Leave editor' }))
    await waitFor(() => expect(confirmation).toHaveBeenCalledTimes(1))
    expect(router.state.location.pathname).toBe('/alice.eth/edit-records')
    expect(screen.getByLabelText('Draft value')).toHaveTextContent(
      'https://draft.example',
    )

    await act(async () => {
      void router.navigate({
        to: '/$name/records',
        params: { name: 'alice.eth' },
      })
    })
    await waitFor(() => expect(confirmation).toHaveBeenCalledTimes(2))
    expect(router.state.location.pathname).toBe('/alice.eth/edit-records')
    expect(screen.getByLabelText('Draft value')).toHaveTextContent(
      'https://draft.example',
    )

    confirmation.mockReturnValue(true)
    await user.click(screen.getByRole('link', { name: 'Leave editor' }))
    expect(
      await screen.findByRole('heading', { name: 'Records destination' }),
    ).toBeInTheDocument()
  })
})
