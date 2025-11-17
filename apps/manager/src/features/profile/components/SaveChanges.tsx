import type { ProfileRecords } from '@/features/profile/types'
import { defaultProfileRecords } from '../utils/transformRecords'
import { DiffDialog } from './dialogs/DiffDialog'
import { sharedOptions, withForm } from './form'

interface SaveChangesProps {
  originalData: ProfileRecords
  onSave: () => void
}

export const SaveChanges = withForm({
  ...sharedOptions,
  props: {
    originalData: defaultProfileRecords,
    onSave: () => {},
  } as SaveChangesProps,
  render: ({ form, originalData, onSave }) => (
    <form.Subscribe selector={(state) => state.values}>
      {(currentData) => (
        <DiffDialog
          originalData={originalData}
          currentData={currentData}
          onSave={onSave}
        />
      )}
    </form.Subscribe>
  ),
})
