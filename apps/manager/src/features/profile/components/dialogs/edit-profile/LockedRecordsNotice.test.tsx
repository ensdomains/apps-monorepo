import { describe, expect, it } from 'vitest'
import type { RecordType } from '@/features/profile/service/resolverWriteAccess'
import { render } from '@/utils/test-utils'
import { LockedRecordsNotice } from './LockedRecordsNotice'
import { EditableRecordTypesProvider } from './LockedRecordTypes.context'

const ADDRESS_LOCKED = {
  text: true,
  address: false,
  contentHash: true,
  abi: true,
}

const renderNotice = (type: RecordType) =>
  render(
    <EditableRecordTypesProvider editableTypes={ADDRESS_LOCKED}>
      <LockedRecordsNotice type={type} />
    </EditableRecordTypesProvider>,
  )

describe('LockedRecordsNotice', () => {
  it('explains a locked record type', () => {
    const view = renderNotice('address')

    expect(view.getByRole('status')).toHaveTextContent(
      'permission to change this name’s addresses',
    )
  })

  it('renders nothing for a record type the wallet can write', () => {
    const view = renderNotice('text')

    expect(view.queryByRole('status')).toBeNull()
  })
})
