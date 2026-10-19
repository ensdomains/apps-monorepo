// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'
import {
  ALL_EDITABLE_TYPES,
  type EditableTypes,
  NO_EDITABLE_TYPES,
} from '@/utils/records/editRecordUtils'
import { EditRecordsTable } from './EditRecordsTable'

const address = { type: 'address' as const, key: 'ETH', value: '0x1', id: 60 }
const text = { type: 'text' as const, key: 'name', value: 'Jane' }
const avatar = { type: 'text' as const, key: 'avatar', value: 'ipfs://a' }

const TEXT_ONLY: EditableTypes = { ...NO_EDITABLE_TYPES, text: 'all' }

const renderTable = (
  editableTypes: EditableTypes,
  records: NameRecord[] = [address, text],
) => {
  const onDeleteRecord = vi.fn()
  const view = render(
    <EditRecordsTable
      records={records}
      globalFilter=""
      editableTypes={editableTypes}
      onDeleteRecord={onDeleteRecord}
    />,
  )
  const rerender = (types: EditableTypes) =>
    view.rerender(
      <EditRecordsTable
        records={records}
        globalFilter=""
        editableTypes={types}
        onDeleteRecord={onDeleteRecord}
      />,
    )
  return { onDeleteRecord, rerender }
}

describe('EditRecordsTable', () => {
  it('closes an open delete confirmation when its type stops being editable', async () => {
    const { onDeleteRecord, rerender } = renderTable(ALL_EDITABLE_TYPES)

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Delete record' })[0],
    )
    expect(screen.getByText('Remove ETH?')).toBeTruthy()

    rerender(TEXT_ONLY)

    expect(screen.queryByText('Remove ETH?')).toBeNull()
    expect(onDeleteRecord).not.toHaveBeenCalled()
  })

  it('bulk-deletes only rows that are still editable', async () => {
    const { onDeleteRecord, rerender } = renderTable(ALL_EDITABLE_TYPES)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(screen.getByText('2 selected')).toBeTruthy()

    rerender(TEXT_ONLY)
    expect(screen.getByText('1 selected')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onDeleteRecord).toHaveBeenCalledTimes(1)
    expect(onDeleteRecord).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text', key: 'name' }),
    )
  })

  it('leaves text rows outside the granted keys read-only', () => {
    renderTable({ ...NO_EDITABLE_TYPES, text: new Set(['avatar']) }, [
      avatar,
      text,
    ])

    expect(
      screen.getAllByRole('button', { name: 'Delete record' }),
    ).toHaveLength(1)
  })
})
