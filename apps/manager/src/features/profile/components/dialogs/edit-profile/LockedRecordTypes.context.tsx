import { createContext, type ReactNode, use } from 'react'
import {
  NO_LOCKED_RECORD_TYPES,
  type RecordType,
} from '@/features/profile/service/recordTypeLocks'

const LockedRecordTypesContext = createContext<ReadonlySet<RecordType>>(
  NO_LOCKED_RECORD_TYPES,
)

export const LockedRecordTypesProvider = ({
  children,
  lockedRecordTypes,
}: {
  readonly children: ReactNode
  readonly lockedRecordTypes: ReadonlySet<RecordType>
}) => (
  <LockedRecordTypesContext.Provider value={lockedRecordTypes}>
    {children}
  </LockedRecordTypesContext.Provider>
)

export const useIsRecordTypeLocked = (type: RecordType) =>
  use(LockedRecordTypesContext).has(type)
