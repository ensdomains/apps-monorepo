// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RecordType } from '@/utils/records/editRecordUtils'
import { EditRecordsTable } from './EditRecordsTable'

const address = { type: 'address' as const, key: 'ETH', value: '0x1', id: 60 }
const text = { type: 'text' as const, key: 'name', value: 'Jane' }

const renderTable = (editableTypes: ReadonlySet<RecordType>) => {
  const onDeleteRecord = vi.fn()
  const view = render(
    <EditRecordsTable
      records={[address, text]}
      globalFilter=""
      editableTypes={editableTypes}
      onDeleteRecord={onDeleteRecord}
    />,
  )
  const rerender = (types: ReadonlySet<RecordType>) =>
    view.rerender(
      <EditRecordsTable
        records={[address, text]}
        globalFilter=""
        editableTypes={types}
        onDeleteRecord={onDeleteRecord}
      />,
    )
  return { onDeleteRecord, rerender }
}

describe('EditRecordsTable', () => {
  it('closes an open delete confirmation when its type stops being editable', async () => {
    const { onDeleteRecord, rerender } = renderTable(
      new Set(['address', 'text']),
    )

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Delete record' })[0],
    )
    expect(screen.getByText('Remove ETH?')).toBeTruthy()

    rerender(new Set(['text']))

    expect(screen.queryByText('Remove ETH?')).toBeNull()
    expect(onDeleteRecord).not.toHaveBeenCalled()
  })

  it('bulk-deletes only rows that are still editable', async () => {
    const { onDeleteRecord, rerender } = renderTable(
      new Set(['address', 'text']),
    )

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(screen.getByText('2 selected')).toBeTruthy()

    rerender(new Set(['text']))
    expect(screen.getByText('1 selected')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onDeleteRecord).toHaveBeenCalledTimes(1)
    expect(onDeleteRecord).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text', key: 'name' }),
    )
  })
})
