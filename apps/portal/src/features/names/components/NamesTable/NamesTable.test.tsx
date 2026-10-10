import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AddressNameItem } from '@/utils/names/addressNames'

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

const row = (name: string, expiryDate: Date | null): AddressNameItem => ({
  name,
  expiryDate,
  relations: ['owner'],
  protocolVersion: 'ENSv2',
})

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

// An expiry a Date cannot hold reaches the table as null, never as an
// Invalid Date; the read guards it.
describe('NamesTable expiry cell', () => {
  it('renders a name with no expiry', () => {
    render(<NamesTableHarness data={[row('attacker-minted.eth', null)]} />)

    // Rendered twice: the desktop row and the mobile card.
    expect(screen.getAllByText('attacker-minted.eth')).not.toHaveLength(0)
    expect(screen.getAllByText('Does not expire')).not.toHaveLength(0)
  })

  it('keeps a good row rendering beside one with no expiry', () => {
    render(
      <NamesTableHarness
        data={[
          row('attacker-minted.eth', null),
          row('victim.eth', new Date(Date.UTC(2030, 0, 1))),
        ]}
      />,
    )

    // Per row, so a silently dropped bad row can't pass this.
    expect(desktopRowText('attacker-minted.eth')).toContain('Does not expire')
    expect(desktopRowText('victim.eth')).toContain('2030')
  })

  it('labels each relation the address holds', () => {
    render(
      <NamesTableHarness
        data={[{ ...row('both.eth', null), relations: ['owner', 'manager'] }]}
      />,
    )

    expect(desktopRowText('both.eth')).toContain('Owner')
    expect(desktopRowText('both.eth')).toContain('Manager')
  })
})
