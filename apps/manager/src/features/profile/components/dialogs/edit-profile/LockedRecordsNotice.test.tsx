import { describe, expect, it } from 'vitest'
import type { RecordType } from '@/features/profile/service/recordTypeLocks'
import { render } from '@/utils/test-utils'
import { LockedRecordsNotice } from './LockedRecordsNotice'
import { LockedRecordTypesProvider } from './LockedRecordTypes.context'

const renderNotice = (
  type: RecordType,
  lockedRecordTypes: ReadonlySet<RecordType>,
) =>
  render(
    <LockedRecordTypesProvider lockedRecordTypes={lockedRecordTypes}>
      <LockedRecordsNotice type={type} />
    </LockedRecordTypesProvider>,
  )

describe('LockedRecordsNotice', () => {
  it('explains a locked record type', () => {
    const view = renderNotice('address', new Set(['address']))

    expect(view.getByRole('status')).toHaveTextContent(
      'permission to change this name’s addresses',
    )
  })

  it('renders nothing for a record type the wallet can write', () => {
    const view = renderNotice('text', new Set(['address']))

    expect(view.queryByRole('status')).toBeNull()
  })
})
