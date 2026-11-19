import { createContext, type ReactNode, use } from 'react'
import type {
  EditableRecordTypes,
  RecordType,
} from '@/features/profile/service/resolverWriteAccess'

// Undefined locks nothing: access is unknown, or records move to another resolver.
const EditableRecordTypesContext = createContext<
  EditableRecordTypes | undefined
>(undefined)

export const EditableRecordTypesProvider = ({
  children,
  editableTypes,
}: {
  readonly children: ReactNode
  readonly editableTypes: EditableRecordTypes | undefined
}) => (
  <EditableRecordTypesContext.Provider value={editableTypes}>
    {children}
  </EditableRecordTypesContext.Provider>
)

export const useIsRecordTypeLocked = (type: RecordType) =>
  use(EditableRecordTypesContext)?.[type] === false
