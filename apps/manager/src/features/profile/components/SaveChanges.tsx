import type { ProfileRecords } from '@/features/profile/types'
import { defaultProfileRecords } from '../utils/transformRecords'
import { DiffDialog } from './dialogs/DiffDialog'
import { sharedOptions, withForm } from './form'

interface SaveChangesProps {
  originalData: ProfileRecords
  onSave: () => void
  isSaving?: boolean
  isSuccess?: boolean
  errorMessage?: string
  txHash?: string
}

export const SaveChanges = withForm({
  ...sharedOptions,
  props: {
    originalData: defaultProfileRecords,
    onSave: () => {},
  } as SaveChangesProps,
  render: ({
    form,
    originalData,
    onSave,
    isSaving,
    isSuccess,
    errorMessage,
    txHash,
  }) => (
    <form.Subscribe selector={(state) => state.values}>
      {(currentData) => (
        <DiffDialog
          originalData={originalData}
          currentData={currentData}
          onSave={onSave}
          isSaving={isSaving}
          isSuccess={isSuccess}
          errorMessage={errorMessage}
          txHash={txHash}
        />
      )}
    </form.Subscribe>
  ),
})
