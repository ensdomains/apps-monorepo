import { shallowEqual, useSelector } from '@xstate/react'
import { createContext, use, useMemo } from 'react'
import type { Actor } from 'xstate'
import type {
  EditProfileDialogSnapshot,
  editProfileDialogMachine,
} from './EditProfileDialog.machine'
import type { GeneralField } from './EditProfileGeneralTab.fields'

const EditProfileDialogContext = createContext<{
  dialogActor: Actor<typeof editProfileDialogMachine>
} | null>(null)

export const EditProfileDialogProvider = ({
  actor,
  children,
}: {
  readonly actor: Actor<typeof editProfileDialogMachine>
  readonly children: React.ReactNode
}) => (
  <EditProfileDialogContext.Provider value={{ dialogActor: actor }}>
    {children}
  </EditProfileDialogContext.Provider>
)

export const useEditProfileDialogContext = () => {
  const context = use(EditProfileDialogContext)
  if (!context) {
    throw new Error('You used a hook outside of the EditProfileDialogProvider')
  }
  return context
}

export const useEditProfileDialogSelector = <T,>(
  selector: (snapshot: EditProfileDialogSnapshot) => T,
  compare?: (a: T, b: T) => boolean,
) => {
  const { dialogActor } = useEditProfileDialogContext()
  return useSelector(dialogActor, selector, compare)
}

export const useEditProfileDialogStatus = () =>
  useEditProfileDialogSelector(
    (snapshot) => ({
      errorMessage: snapshot.context.localSaveError,
      isSaving: snapshot.matches({ editing: 'saving' }),
      isSuccess: snapshot.matches({ editing: 'success' }),
      txHash: snapshot.context.txHash,
    }),
    shallowEqual,
  )

export const useEditProfileVisibleFields = () =>
  useEditProfileDialogSelector((snapshot) => snapshot.context.visibleFields)

export const useEditProfileDialogActions = () => {
  const { dialogActor } = useEditProfileDialogContext()

  return useMemo(
    () => ({
      toggleField: (field: GeneralField) =>
        dialogActor.send({ type: 'TOGGLE_GENERAL_FIELD', field }),
    }),
    [dialogActor],
  )
}
