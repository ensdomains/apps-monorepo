import type { ProfileRecords } from '@/features/profile/types'
import { defaultProfileRecords } from '../utils/transformRecords'
import {
  DiffDialog,
  type DiffDialogValidationIssue,
} from './dialogs/DiffDialog'
import { sharedOptions, withForm } from './form'

interface SaveChangesProps {
  name: string
  originalData: ProfileRecords
  onSave: () => void
  onReset?: () => void
  isSaving?: boolean
  isSuccess?: boolean
  saveErrorMessage?: string
  validationIssues?: DiffDialogValidationIssue[]
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
    onReset,
    isSaving,
    isSuccess,
    saveErrorMessage,
    validationIssues,
  }) => (
    <form.Subscribe
      selector={(state) => ({
        values: state.values,
        canSubmit: state.canSubmit && state.isValid,
      })}
    >
      {({ values: currentData, canSubmit }) => (
        <DiffDialog
          canSubmit={canSubmit}
          currentData={currentData}
          isSaving={isSaving}
          isSuccess={isSuccess}
          name={name}
          onReset={onReset}
          onSave={onSave}
          originalData={originalData}
          saveErrorMessage={saveErrorMessage}
          validationIssues={validationIssues}
        />
      )}
    </form.Subscribe>
  ),
})
