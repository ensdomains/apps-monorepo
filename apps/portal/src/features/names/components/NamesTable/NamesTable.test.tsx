import type { AddressNameRow } from '@ens-apps/bigname'
import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  type AddressNameItem,
  toAddressNameItems,
} from '@/utils/names/addressNames'

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
 * An expiry a subregistry can mint but `Date` cannot hold. Before the switch
 * to bigname it reached `Temporal.PlainDate.from({ year: NaN })` as an
 * `Invalid Date` and took the whole route down. bigname saturates such an
 * expiry at `i64::MAX` seconds, which must still map to no expiry rather than
 * an invalid date.
 */
const OUT_OF_RANGE_EXPIRY = '9223372036854775807'

const ADDRESS = '0x1111111111111111111111111111111111111111'

const items = (
  rows: { name: string; expires_at?: string }[],
): AddressNameItem[] =>
  toAddressNameItems(
    rows.map(
      (row): AddressNameRow => ({
        display_name: row.name,
        namespace: 'ens',
        namehash: '0x00',
        authority: 'ens_v2',
        registration_status: 'registered',
        relations: ['owner'],
        is_primary: false,
        ...row,
      }),
    ),
    ADDRESS,
  )

const NamesTableHarness = ({ data }: { data: AddressNameItem[] }) => {
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
    const data = items([
      { name: 'attacker-minted.eth', expires_at: OUT_OF_RANGE_EXPIRY },
    ])

    render(<NamesTableHarness data={data} />)

    // Rendered twice: the desktop row and the mobile card.
    expect(screen.getAllByText('attacker-minted.eth')).not.toHaveLength(0)
    expect(screen.getAllByText('Does not expire')).not.toHaveLength(0)
  })

  it('renders a name bigname serves without an expiry', () => {
    render(<NamesTableHarness data={items([{ name: 'forever.eth' }])} />)

    expect(desktopRowText('forever.eth')).toContain('Does not expire')
  })

  it('keeps a good row rendering beside a bad one', () => {
    const data = items([
      { name: 'attacker-minted.eth', expires_at: OUT_OF_RANGE_EXPIRY },
      { name: 'victim.eth', expires_at: String(Date.UTC(2030, 0, 1) / 1000) },
    ])

    render(<NamesTableHarness data={data} />)

    // Per row, so a silently dropped bad row can't pass this.
    expect(desktopRowText('attacker-minted.eth')).toContain('Does not expire')
    expect(desktopRowText('victim.eth')).toContain('2030')
  })
})
