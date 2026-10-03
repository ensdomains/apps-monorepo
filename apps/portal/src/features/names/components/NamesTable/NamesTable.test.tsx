import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { type MergedName, mergeNamesData } from '@/utils/names/mergeNamesData'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('@/components/EntityBadge', () => ({
  EntityBadge: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))

const { NamesTable } = await import('./NamesTable')
const { columns } = await import('./columns')

/**
 * An expiry a subregistry can mint but `Date` cannot hold. `new Date(x * 1000)`
 * yields `Invalid Date`, which is truthy — the shape that used to reach
 * `Temporal.PlainDate.from({ year: NaN })` and take the whole route down.
 */
const OUT_OF_RANGE_EXPIRY = 2 ** 63

const NamesTableHarness = ({ data }: { data: MergedName[] }) => {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  return <NamesTable table={table} />
}

/** The `<tr>` the given name renders in, so each row's expiry is read in place. */
const desktopRowText = (name: string) =>
  screen
    .getAllByText(name)
    .map((el) => el.closest('tr'))
    .find(Boolean)?.textContent ?? ''

describe('NamesTable expiry cell', () => {
  it('renders a name whose expiry overflows the Date range', () => {
    const data = mergeNamesData(
      [],
      [
        {
          name: 'attacker-minted.eth',
          subdomains: [],
          expiryDate: OUT_OF_RANGE_EXPIRY,
        },
      ],
    )

    render(<NamesTableHarness data={data} />)

    // Rendered twice: the desktop row and the mobile card.
    expect(screen.getAllByText('attacker-minted.eth')).not.toHaveLength(0)
    expect(screen.getAllByText('Does not expire')).not.toHaveLength(0)
  })

  it('keeps a good row rendering beside a bad one', () => {
    const data = mergeNamesData(
      [],
      [
        {
          name: 'attacker-minted.eth',
          subdomains: [],
          expiryDate: OUT_OF_RANGE_EXPIRY,
        },
        {
          name: 'victim.eth',
          subdomains: [],
          expiryDate: Math.floor(Date.UTC(2030, 0, 1) / 1000),
        },
      ],
    )

    render(<NamesTableHarness data={data} />)

    // Per row, so a silently dropped bad row can't pass this.
    expect(desktopRowText('attacker-minted.eth')).toContain('Does not expire')
    expect(desktopRowText('victim.eth')).toContain('2030')
  })
})
