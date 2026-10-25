import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NamesFilters } from './NamesFilters'
import { columns } from './NamesTable/columns'

const NO_ROWS: import('./NamesTable/columns').NameRow[] = []

const Harness = ({ state }: { state: 'loading' | 'unavailable' }) => {
  const table = useReactTable({
    data: NO_ROWS,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })
  return <NamesFilters table={table} v2RolesState={state} />
}

describe('NamesFilters role availability', () => {
  it.each([
    { state: 'loading', message: 'Loading ENSv2 roles…' },
    {
      state: 'unavailable',
      message:
        'ENSv2 roles are unavailable. V1 relationships can still be filtered.',
    },
  ] as const)(
    'keeps V1 available while V2 is $state',
    async ({ state, message }) => {
      const user = userEvent.setup()
      render(<Harness state={state} />)
      await user.click(screen.getByRole('button', { name: 'Filters' }))
      await user.click(screen.getByText('Roles', { selector: 'summary' }))
      expect(screen.getByRole('status')).toHaveTextContent(message)
      expect(screen.getByLabelText('Renew')).toBeDisabled()
      expect(screen.getByLabelText('Owner')).toBeEnabled()
      await user.click(screen.getByLabelText('Owner'))
      await user.click(screen.getByRole('button', { name: 'Close filters' }))
      expect(
        screen.getByRole('button', { name: 'Remove roles filter' }),
      ).toHaveTextContent('Owner')
    },
  )
})
