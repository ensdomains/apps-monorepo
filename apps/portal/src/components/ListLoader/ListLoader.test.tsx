import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'
import { ListLoader } from './ListLoader'
import { useListLoader } from './useListLoader'

const rowsUpTo = (count: number) =>
  Array.from({ length: count }, (_, i) => `row ${i + 1}`)

/** A list whose rows are all in memory, like the dashboard's "Your names". */
const ClientList = ({
  count,
  initialCount,
  resetKey,
}: {
  readonly count: number
  readonly initialCount: number
  readonly resetKey?: string
}) => {
  const rows = rowsUpTo(count)
  const { shown, loader } = useListLoader({
    initialCount,
    loaded: rows.length,
    resetKey,
  })

  return (
    <>
      <ul>
        {rows.slice(0, shown).map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
      <ListLoader {...loader} />
    </>
  )
}

/**
 * A list fetched a page at a time, like history. `fetchPage` stands in for the
 * request and decides whether it lands.
 */
const ServerList = ({
  total,
  pageSize,
  initialCount,
  isTotalKnown = true,
  fetchPage = () => Promise.resolve(),
  resetKey,
}: {
  readonly total: number
  readonly pageSize: number
  readonly initialCount: number
  readonly isTotalKnown?: boolean
  readonly fetchPage?: () => Promise<void>
  readonly resetKey?: string
}) => {
  const [loaded, setLoaded] = useState(Math.min(pageSize, total))
  // One `More` can fetch several pages back to back, before a re-render hands
  // out a fresh closure — so the running count lives in a ref, as a query
  // cache would hold it.
  const loadedRef = useRef(loaded)
  const { shown, loader } = useListLoader({
    initialCount,
    loaded,
    total: isTotalKnown ? total : undefined,
    hasMore: loaded < total,
    resetKey,
    fetchMore: async () => {
      await fetchPage()
      const next = Math.min(total, loadedRef.current + pageSize)
      loadedRef.current = next
      setLoaded(next)
      return { loaded: next, hasMore: next < total }
    },
  })

  return (
    <>
      <ul>
        {rowsUpTo(shown).map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
      <ListLoader {...loader} />
    </>
  )
}

const renderList = (ui: React.ReactElement) =>
  render(ui, { wrapper: createTestWrapper() })

const more = () => screen.getByRole('button', { name: 'More' })
const all = () => screen.getByRole('button', { name: 'All' })

describe('ListLoader on a client-side list', () => {
  it('opens at the list’s own initial count', () => {
    renderList(<ClientList count={12} initialCount={4} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText('Showing 4 of 12')).toBeInTheDocument()
  })

  it('doubles what is shown on More', async () => {
    const user = userEvent.setup()
    renderList(<ClientList count={30} initialCount={4} />)

    await user.click(more())
    expect(screen.getByText('Showing 8 of 30')).toBeInTheDocument()

    await user.click(more())
    expect(screen.getByText('Showing 16 of 30')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(16)
  })

  it('shows everything on All, then disappears', async () => {
    const user = userEvent.setup()
    renderList(<ClientList count={30} initialCount={4} />)

    await user.click(all())

    expect(screen.getAllByRole('listitem')).toHaveLength(30)
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
  })

  it('disappears when a doubling reaches the end', async () => {
    const user = userEvent.setup()
    renderList(<ClientList count={6} initialCount={4} />)

    await user.click(more())

    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })

  // A route that moves from one name to another keeps the component mounted.
  it('opens the next list at its initial count, not the last one’s', async () => {
    const user = userEvent.setup()
    const { rerender } = renderList(
      <ClientList count={30} initialCount={4} resetKey="alice.eth" />,
    )
    await user.click(all())
    expect(screen.getAllByRole('listitem')).toHaveLength(30)

    rerender(<ClientList count={50} initialCount={4} resetKey="bob.eth" />)

    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText('Showing 4 of 50')).toBeInTheDocument()
  })

  it('keeps the reader’s choice while the same list refreshes', async () => {
    const user = userEvent.setup()
    const { rerender } = renderList(
      <ClientList count={30} initialCount={4} resetKey="alice.eth" />,
    )
    await user.click(more())

    rerender(<ClientList count={31} initialCount={4} resetKey="alice.eth" />)

    expect(screen.getByText('Showing 8 of 31')).toBeInTheDocument()
  })

  // A caller that opens a list collapsed still gets a `More` that does something.
  it('reveals a row on More when the list opens with none', async () => {
    const user = userEvent.setup()
    renderList(<ClientList count={5} initialCount={0} />)
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)

    await user.click(more())
    expect(screen.getAllByRole('listitem')).toHaveLength(1)

    await user.click(more())
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('renders nothing for a list that fits its initial count', () => {
    renderList(<ClientList count={3} initialCount={4} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })
})

describe('ListLoader on a server-paged list', () => {
  // 200 shown, 100-row pages: doubling to 400 takes two fetches, not one.
  it('fetches as many pages as a doubling takes', async () => {
    const user = userEvent.setup()
    const fetchPage = vi.fn(() => Promise.resolve())
    renderList(
      <ServerList
        total={1234}
        pageSize={100}
        initialCount={100}
        fetchPage={fetchPage}
      />,
    )
    expect(screen.getByText('Showing 100 of 1234')).toBeInTheDocument()

    await user.click(more())
    await screen.findByText('Showing 200 of 1234')
    expect(fetchPage).toHaveBeenCalledTimes(1)

    await user.click(more())
    await screen.findByText('Showing 400 of 1234')
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('reveals rows already fetched without another request', async () => {
    const user = userEvent.setup()
    const fetchPage = vi.fn(() => Promise.resolve())
    renderList(
      <ServerList
        total={500}
        pageSize={100}
        initialCount={15}
        fetchPage={fetchPage}
      />,
    )

    await user.click(more())

    expect(screen.getByText('Showing 30 of 500')).toBeInTheDocument()
    expect(fetchPage).not.toHaveBeenCalled()
  })

  it('fetches the rest on All, then disappears', async () => {
    const user = userEvent.setup()
    const fetchPage = vi.fn(() => Promise.resolve())
    renderList(
      <ServerList
        total={450}
        pageSize={100}
        initialCount={100}
        fetchPage={fetchPage}
      />,
    )

    await user.click(all())

    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(450),
    )
    expect(fetchPage).toHaveBeenCalledTimes(4)
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })

  it('says it is loading, and holds both controls, while a fetch is in flight', async () => {
    const user = userEvent.setup()
    let land: () => void = () => {}
    const fetchPage = () =>
      new Promise<void>((resolve) => {
        land = resolve
      })
    renderList(
      <ServerList
        total={300}
        pageSize={100}
        initialCount={100}
        fetchPage={fetchPage}
      />,
    )

    await user.click(more())

    expect(await screen.findByRole('status')).toHaveTextContent('Loading…')
    expect(more()).toBeDisabled()
    expect(all()).toBeDisabled()

    land()
    await screen.findByText('Showing 200 of 300')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // A failed page must not cost the reader what is already on screen.
  it('keeps the rows shown when a fetch fails, and retries on the next press', async () => {
    const user = userEvent.setup()
    const fetchPage = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('indexer unavailable'))
      .mockResolvedValue(undefined)
    renderList(
      <ServerList
        total={300}
        pageSize={100}
        initialCount={100}
        fetchPage={fetchPage}
      />,
    )

    await user.click(more())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t load more.',
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(100)
    expect(screen.getByText('Showing 100 of 300')).toBeInTheDocument()

    await user.click(more())

    await screen.findByText('Showing 200 of 300')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not carry one list’s failure over to the next', async () => {
    const user = userEvent.setup()
    const fetchPage = () => Promise.reject(new Error('indexer unavailable'))
    const { rerender } = renderList(
      <ServerList
        total={300}
        pageSize={100}
        initialCount={100}
        fetchPage={fetchPage}
        resetKey="alice.eth"
      />,
    )
    await user.click(more())
    await screen.findByRole('alert')

    rerender(
      <ServerList
        total={300}
        pageSize={100}
        initialCount={100}
        fetchPage={fetchPage}
        resetKey="bob.eth"
      />,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 100 of 300')).toBeInTheDocument()
  })

  // Some sources can't say how many rows exist until the last page arrives.
  it('leaves the total off while it is unknown', async () => {
    const user = userEvent.setup()
    renderList(
      <ServerList
        total={250}
        pageSize={100}
        initialCount={100}
        isTotalKnown={false}
      />,
    )

    expect(screen.getByText('Showing 100')).toBeInTheDocument()

    await user.click(more())
    await screen.findByText('Showing 200')

    await user.click(more())
    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(250),
    )
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })
})

describe('ListLoader when the source holds fewer rows than the total', () => {
  // An honest count beats a hidden one: nothing more can be revealed, but the
  // reader is still told rows are missing.
  it('keeps the count and drops the controls', () => {
    renderList(
      <ListLoader
        shown={100}
        total={588}
        canShowMore={false}
        status="idle"
        onMore={vi.fn()}
        onAll={vi.fn()}
      />,
    )

    expect(screen.getByText('Showing 100 of 588')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull()
  })
})
