export type RecordType = 'text' | 'address' | 'contentHash' | 'abi'

export type EditableRecordTypes = Readonly<Record<RecordType, boolean>>

export const NO_EDITABLE_RECORD_TYPES: EditableRecordTypes = {
  text: false,
  address: false,
  contentHash: false,
  abi: false,
}

const RECORD_TYPES: readonly RecordType[] = [
  'text',
  'address',
  'contentHash',
  'abi',
]

export const NO_LOCKED_RECORD_TYPES: ReadonlySet<RecordType> = new Set()

export const hasEditableRecordType = (types: EditableRecordTypes): boolean =>
  RECORD_TYPES.some((type) => types[type])

/** Nothing is locked while access is unknown, or while records move to a resolver the owner controls. */
export const getLockedRecordTypes = ({
  editableTypes,
  isReplacingResolver,
}: {
  readonly editableTypes: EditableRecordTypes | undefined
  readonly isReplacingResolver: boolean
}): ReadonlySet<RecordType> =>
  !editableTypes || isReplacingResolver
    ? NO_LOCKED_RECORD_TYPES
    : new Set(RECORD_TYPES.filter((type) => !editableTypes[type]))
