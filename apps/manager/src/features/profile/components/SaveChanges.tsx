import type { ProfileRecords } from '@/features/profile/types'
import { defaultProfileRecords } from '../utils/transformRecords'
import { DiffDialog } from './dialogs/DiffDialog'
import { sharedOptions, withForm } from './form'

interface SaveChangesProps {
  originalData: ProfileRecords
  onSave: () => void
  onCancel: () => void
}

export const SaveChanges = withForm({
  ...sharedOptions,
  props: {
    originalData: defaultProfileRecords,
    onSave: () => {},
    onCancel: () => {},
  } as SaveChangesProps,
  render: ({ form, originalData, onSave, onCancel }) => (
    <form.Subscribe selector={(state) => state.values}>
      {(currentData) => (
        <DiffDialog
          originalData={originalData}
          currentData={currentData}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}
    </form.Subscribe>
  ),
})
