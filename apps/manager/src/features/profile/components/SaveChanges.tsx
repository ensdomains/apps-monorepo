import type { ProfileRecords } from '@/features/profile/types'
import { defaultProfileRecords } from '../utils/transformRecords'
import { DiffDialog } from './dialogs/DiffDialog'
import { sharedOptions, withForm } from './form'

interface SaveChangesProps {
  name: string
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
    name: '',
    originalData: defaultProfileRecords,
    onSave: () => {},
  } as SaveChangesProps,
  render: ({
    form,
    name,
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
          name={name}
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
