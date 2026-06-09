import type { ProfileRecords } from '@/features/profile/types'
import { defaultProfileRecords } from '../utils/transformRecords'
import { DiffDialog } from './dialogs/DiffDialog'
import { sharedOptions, withForm } from './form'

interface SaveChangesProps {
  name: string
  originalData: ProfileRecords
  onSave: () => void
  onReset?: () => void
  isSaving?: boolean
  isSuccess?: boolean
  validationIssues?: Array<{
    sectionKey?: string
    fieldKey?: string
    message: string
  }>
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
          validationIssues={validationIssues}
        />
      )}
    </form.Subscribe>
  ),
})
